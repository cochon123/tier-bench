import { categories, leaderboard, models, tierForScore, tierMeta, Tier } from "../../../data";

export const DATA_START = "2026-08-01";
export const DATA_END = "2026-08-24";
export const ALGORITHM = "bayesian-mean-v1";

export type HistoryPoint = {
  date: string;
  score: number;
  tier: Tier;
  rank: number;
  voters: number;
  confidence: { low: number; high: number };
  distribution: Record<Tier, number>;
};

const tiers = Object.keys(tierMeta) as Tier[];
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const round = (value: number, places = 2) => Number(value.toFixed(places));
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const hash = (value: string) => [...value].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 7);

export function parseDay(value: string | null, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return fallback;
  return value;
}

export function eachDay(from: string, to: string) {
  const result: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) { result.push(isoDay(cursor)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return result;
}

function releaseDay(modelId: string) {
  const model = models.find((item) => item.id === modelId)!;
  return isoDay(new Date(model.release));
}

function scoreOn(modelId: string, category: string, date: string) {
  const target = leaderboard(category).find((item) => item.id === modelId)!.score;
  const start = releaseDay(modelId);
  const elapsed = Math.max(0, (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  const total = Math.max(1, (Date.parse(`${DATA_END}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  const progress = clamp(elapsed / total, 0, 1);
  const seed = hash(`${modelId}:${category}`);
  const openingOffset = ((seed % 141) - 70) / 100;
  const wave = Math.sin((elapsed + seed % 9) * .72) * .09 * (1 - progress);
  return round(clamp(target - openingOffset * (1 - progress) + wave, 1, 6));
}

function distribution(score: number, voters: number): Record<Tier, number> {
  const weights = tiers.map((tier) => {
    const distance = Math.abs(tierMeta[tier].score - score);
    return Math.exp(-(distance * distance) / 1.7);
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  const counts = weights.map((weight) => Math.floor(weight / total * voters));
  counts[weights.indexOf(Math.max(...weights))] += voters - counts.reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(tiers.map((tier, index) => [tier, counts[index]])) as Record<Tier, number>;
}

export function boardAt(category: string, date = DATA_END) {
  const entries = models.filter((model) => releaseDay(model.id) <= date).map((model) => {
    const score = scoreOn(model.id, category, date);
    const elapsed = Math.max(0, (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${releaseDay(model.id)}T00:00:00Z`)) / 86_400_000);
    const finalVoters = leaderboard(category).find((item) => item.id === model.id)!.voters;
    const voters = Math.min(finalVoters, 24 + Math.floor(Math.pow(elapsed + 1, .82) * 91) + hash(model.id) % 37);
    const margin = round(1.96 * Math.max(.04, .42 / Math.sqrt(Math.max(1, voters / 10))));
    return { ...model, score, tier: tierForScore(score), voters, confidence: { low: round(clamp(score - margin, 1, 6)), high: round(clamp(score + margin, 1, 6)) }, distribution: distribution(score, voters) };
  }).sort((a, b) => b.score - a.score || b.voters - a.voters);
  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function modelHistory(modelId: string, category: string, from: string, to: string, interval: "day" | "week" = "day"): HistoryPoint[] {
  const released = releaseDay(modelId);
  const days = eachDay(from < released ? released : from, to).filter((_, index, all) => interval === "day" || index % 7 === 0 || index === all.length - 1);
  return days.map((date) => {
    const entry = boardAt(category, date).find((item) => item.id === modelId)!;
    return { date, score: entry.score, tier: entry.tier, rank: entry.rank, voters: entry.voters, confidence: entry.confidence, distribution: entry.distribution };
  });
}

export function apiMeta(extra: Record<string, unknown> = {}) {
  return { apiVersion: "1.0", algorithm: ALGORITHM, generatedAt: new Date().toISOString(), dataWindow: { from: DATA_START, to: DATA_END }, ...extra };
}

export function validCategory(value: string) { return categories.some((item) => item.slug === value); }
export function modelReleaseDay(modelId: string) { return releaseDay(modelId); }
