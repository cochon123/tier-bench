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

export async function boardAt(category: string, date = today()): Promise<BoardEntry[]> {
  if (!sql) return [];
  const endExclusive = new Date(`${date}T00:00:00Z`); endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const rows = await sql`
    with latest as (
      select distinct on (r.ballot_id) r.ballot_id, r.placements
      from ballot_revisions r
      where r.category_slug = ${category} and r.created_at < ${endExclusive.toISOString()}
      order by r.ballot_id, r.revision desc
    ), scores as (
      select placement.model_id, placement.tier,
        (case placement.tier when 'S' then 6 when 'A' then 5 when 'B' then 4 when 'C' then 3 when 'D' then 2 when 'F' then 1 end)::float as score
      from latest l cross join lateral jsonb_each_text(l.placements) placement(model_id, tier)
      where placement.tier in ('S','A','B','C','D','F')
    )
    select s.model_id, coalesce(c.name, s.model_id) as name, coalesce(c.provider, 'Unknown') as provider,
      c.created_at as released_at, avg(s.score)::float as score, count(*)::int as voters,
      stddev_samp(s.score)::float as stddev,
      count(*) filter (where s.tier = 'S')::int as s_count,
      count(*) filter (where s.tier = 'A')::int as a_count,
      count(*) filter (where s.tier = 'B')::int as b_count,
      count(*) filter (where s.tier = 'C')::int as c_count,
      count(*) filter (where s.tier = 'D')::int as d_count,
      count(*) filter (where s.tier = 'F')::int as f_count
    from scores s
    left join active_model_catalog c on s.model_id in (c.id, c.canonical_slug, c.api_id, c.default_model_id)
    group by s.model_id, c.name, c.provider, c.created_at
    order by score desc, voters desc, s.model_id
  `;
  return rows.map((row, index) => {
    const score = Number(row.score), voters = Number(row.voters), stddev = row.stddev == null ? null : Number(row.stddev);
    const margin = stddev == null ? null : 1.96 * stddev / Math.sqrt(voters);
    return {
      id: String(row.model_id), name: String(row.name), provider: String(row.provider),
      releasedAt: row.released_at ? new Date(row.released_at).toISOString().slice(0, 10) : null,
      score: round(score), tier: tierForScore(score), rank: index + 1, voters,
      confidence: margin == null ? null : { low: round(Math.max(1, score - margin)), high: round(Math.min(6, score + margin)) },
      distribution: { S: Number(row.s_count), A: Number(row.a_count), B: Number(row.b_count), C: Number(row.c_count), D: Number(row.d_count), F: Number(row.f_count) },
    };
  });
}

export async function boardsAcross(category: string, from: string, to: string, interval: "day" | "week") {
  const days = eachDay(from, to, interval);
  if (days.length > 92) throw new RangeError("range_too_large");
  return Promise.all(days.map(async (date) => ({ date, board: await boardAt(category, date) })));
}
export function historyFor(boards: Awaited<ReturnType<typeof boardsAcross>>, modelId: string): HistoryPoint[] {
  return boards.flatMap(({ date, board }) => {
    const entry = board.find((item) => item.id === modelId);
    return entry ? [{ date, score: entry.score, tier: entry.tier, rank: entry.rank, voters: entry.voters, confidence: entry.confidence, distribution: entry.distribution }] : [];
  });
}
export function apiMeta(extra: Record<string, unknown> = {}) {
  return { apiVersion: "1.0", algorithm: ALGORITHM, generatedAt: new Date().toISOString(), source: "persisted ballot revisions", ...extra };
}
export function validCategory(value: string) { return categories.some((item) => item.slug === value); }
