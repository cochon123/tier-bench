import { NextResponse } from "next/server";
import { sql } from "../../_lib/db";
import { apiMeta, boardsAcross, daysAgo, historyFor, parseDay, today, validCategory } from "../_lib/history";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const ids = (query.get("models") ?? "").split(",").filter(Boolean).slice(0, 10);
  const category = query.get("category") ?? "overall";
  if (!ids.length) return NextResponse.json({ error: { code: "models_required", message: "Pass 1–10 comma-separated model IDs in ?models=" } }, { status: 400 });
  if (!validCategory(category)) return NextResponse.json({ error: { code: "category_not_found", message: `Unknown category: ${category}` } }, { status: 404 });
  const from = parseDay(query.get("from"), daysAgo(30));
  const to = parseDay(query.get("to"), today());
  const interval = query.get("interval") === "week" ? "week" : "day";
  if (from > to || to > today()) return NextResponse.json({ error: { code: "invalid_range", message: "The requested date range is invalid" } }, { status: 400 });
  if (!sql) return NextResponse.json({ data: [], meta: apiMeta({ category, from, to, interval, models: ids }) });
  const catalog = await sql`select id, canonical_slug, api_id, default_model_id, name from active_model_catalog where id = any(${ids}) or canonical_slug = any(${ids}) or api_id = any(${ids}) or default_model_id = any(${ids})`;
  const nameById = new Map<string, string>();
  catalog.forEach((row) => [row.id, row.canonical_slug, row.api_id, row.default_model_id].filter(Boolean).forEach((id) => nameById.set(String(id), String(row.name))));
  if (ids.some((id) => !nameById.has(id))) return NextResponse.json({ error: { code: "model_not_found", message: "One or more model IDs are unknown" } }, { status: 404 });
  let boards;
  try { boards = await boardsAcross(category, from, to, interval); }
  catch { return NextResponse.json({ error: { code: "range_too_large", message: "Request no more than 92 points" } }, { status: 400 }); }
  const data = ids.map((id) => ({ model: nameById.get(id), id, points: historyFor(boards, id) }));
  return NextResponse.json({ data, meta: apiMeta({ category, from, to, interval, models: ids }) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
