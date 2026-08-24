import { categories, tierForScore, tierMeta } from "../../../data.ts";
import type { Tier } from "../../../data.ts";
import { sql } from "../../_lib/db.ts";

export const ALGORITHM = "revision-mean-v1";
export type BoardEntry = {
  id: string; name: string; provider: string; releasedAt: string | null;
  score: number; tier: Tier; rank: number; voters: number;
  confidence: { low: number; high: number } | null;
  distribution: Record<Tier, number>;
};
export type HistoryPoint = Omit<BoardEntry, "id" | "name" | "provider" | "releasedAt"> & { date: string };

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const round = (value: number, places = 2) => Number(value.toFixed(places));

export function today() { return isoDay(new Date()); }
export function daysAgo(days: number) { const date = new Date(); date.setUTCDate(date.getUTCDate() - days); return isoDay(date); }
export function parseDay(value: string | null, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return fallback;
  return value;
}
export function eachDay(from: string, to: string, interval: "day" | "week" = "day") {
  const result: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  const step = interval === "week" ? 7 : 1;
  while (cursor <= end) { result.push(isoDay(cursor)); cursor.setUTCDate(cursor.getUTCDate() + step); }
  if (result.at(-1) !== to) result.push(to);
  return result;
}

export type DatedBoard = { category: string; date: string; board: BoardEntry[] };
export type HistoryQuery = (strings: TemplateStringsArray, ...parameters: unknown[]) => Promise<Record<string, unknown>[]>;

/** One set-based query reconstructs every requested category/date combination. */
export async function boardsAcross(requestedCategories: string[], from: string, to: string, interval: "day" | "week", execute: HistoryQuery | null = sql as unknown as HistoryQuery | null): Promise<DatedBoard[]> {
  const days = eachDay(from, to, interval);
  if (!requestedCategories.length || requestedCategories.length > categories.length || days.length > 92) throw new RangeError("range_too_large");
  if (!execute) return requestedCategories.flatMap((category) => days.map((date) => ({ category, date, board: [] })));
  const step = interval === "week" ? "7 days" : "1 day";
  const rows = await execute`
    with requested(category) as (select unnest(${requestedCategories}::text[])),
    days(day) as (
      select generate_series(${from}::date, ${to}::date, ${step}::interval)::date
      union select ${to}::date
    ), latest as (
      select q.category, d.day, revision.ballot_id, revision.placements
      from requested q cross join days d
      cross join lateral (
        select distinct on (r.ballot_id) r.ballot_id, r.placements
        from ballot_revisions r
        where r.category_slug = q.category and r.created_at < d.day + interval '1 day'
        order by r.ballot_id, r.revision desc
      ) revision
    ), scores as (
      select l.category, l.day, placement.model_id, placement.tier,
        (case placement.tier when 'S' then 6 when 'A' then 5 when 'B' then 4 when 'C' then 3 when 'D' then 2 when 'F' then 1 end)::float as score
      from latest l cross join lateral jsonb_each_text(l.placements) placement(model_id, tier)
      where placement.tier in ('S','A','B','C','D','F')
    ), aggregated as (
      select s.category, s.day, s.model_id, avg(s.score)::float as score, count(*)::int as voters,
        stddev_samp(s.score)::float as stddev,
        count(*) filter (where s.tier = 'S')::int as s_count,
        count(*) filter (where s.tier = 'A')::int as a_count,
        count(*) filter (where s.tier = 'B')::int as b_count,
        count(*) filter (where s.tier = 'C')::int as c_count,
        count(*) filter (where s.tier = 'D')::int as d_count,
        count(*) filter (where s.tier = 'F')::int as f_count
      from scores s group by s.category, s.day, s.model_id
    ), ranked as (
      select a.*, row_number() over (partition by a.category, a.day order by a.score desc, a.voters desc, a.model_id)::int as rank
      from aggregated a
    )
    select r.*, coalesce(c.name, r.model_id) as name, coalesce(c.provider, 'Unknown') as provider,
      c.released_at
    from ranked r
    left join lateral (
      select name, provider, released_at from active_model_catalog c
      where r.model_id in (c.id, c.canonical_slug, c.api_id, c.default_model_id) limit 1
    ) c on true
    order by r.category, r.day, r.rank
  `;
  const byKey = new Map<string, BoardEntry[]>();
  for (const row of rows) {
    const score = Number(row.score), voters = Number(row.voters), stddev = row.stddev == null ? null : Number(row.stddev);
    const margin = stddev == null ? null : 1.96 * stddev / Math.sqrt(voters);
    const entry: BoardEntry = {
      id: String(row.model_id), name: String(row.name), provider: String(row.provider),
      releasedAt: row.released_at ? new Date(row.released_at as string | Date).toISOString().slice(0, 10) : null,
      score: round(score), tier: tierForScore(score), rank: Number(row.rank), voters,
      confidence: margin == null ? null : { low: round(Math.max(1, score - margin)), high: round(Math.min(6, score + margin)) },
      distribution: { S: Number(row.s_count), A: Number(row.a_count), B: Number(row.b_count), C: Number(row.c_count), D: Number(row.d_count), F: Number(row.f_count) },
    };
    const key = `${row.category}:${isoDay(new Date(row.day as string | Date))}`;
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }
  return requestedCategories.flatMap((category) => days.map((date) => ({ category, date, board: byKey.get(`${category}:${date}`) ?? [] })));
}

export async function boardAt(category: string, date = today()): Promise<BoardEntry[]> {
  return (await boardsAcross([category], date, date, "day"))[0]?.board ?? [];
}
export function historyFor(boards: DatedBoard[], modelId: string): HistoryPoint[] {
  return boards.flatMap(({ date, board }) => {
    const entry = board.find((item) => item.id === modelId);
    return entry ? [{ date, score: entry.score, tier: entry.tier, rank: entry.rank, voters: entry.voters, confidence: entry.confidence, distribution: entry.distribution }] : [];
  });
}
export function apiMeta(extra: Record<string, unknown> = {}) {
  return { apiVersion: "1.0", algorithm: ALGORITHM, generatedAt: new Date().toISOString(), source: "persisted ballot revisions", ...extra };
}
export function validCategory(value: string) { return categories.some((item) => item.slug === value); }
