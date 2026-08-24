import { NextResponse } from "next/server";
import { sql } from "../../_lib/db";
import { apiMeta, boardsAcross, daysAgo, historyFor, parseDay, today, validCategory } from "../_lib/history";
import { publicRateLimit, rateLimitResponse } from "../../_lib/rate-limit";

export async function GET(request: Request) {
  const limited = await publicRateLimit(request, "timeseries", 60);
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
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
  const identityByAlias = new Map<string, { id: string; name: string }>();
  const ambiguous = new Set<string>();
  catalog.forEach((row) => {
    const identity = { id: String(row.default_model_id ?? row.canonical_slug), name: String(row.name) };
    [row.id, row.canonical_slug, row.api_id, row.default_model_id].filter(Boolean).forEach((alias) => {
      const key = String(alias), existing = identityByAlias.get(key);
      if (existing && existing.id !== identity.id) ambiguous.add(key); else identityByAlias.set(key, identity);
    });
  });
  if (ids.some((id) => ambiguous.has(id))) return NextResponse.json({ error: { code: "ambiguous_model_alias", message: "One or more model aliases are ambiguous" } }, { status: 409 });
  if (ids.some((id) => !identityByAlias.has(id))) return NextResponse.json({ error: { code: "model_not_found", message: "One or more model IDs are unknown" } }, { status: 404 });
  let boards;
  try { boards = await boardsAcross([category], from, to, interval); }
  catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ error: { code: "range_too_large", message: "Request no more than 92 points" } }, { status: 400 });
    console.error("Unable to read comparison history", error);
    return NextResponse.json({ error: { code: "history_unavailable", message: "Historical data is temporarily unavailable" } }, { status: 503 });
  }
  const data = ids.map((requestedId) => { const identity = identityByAlias.get(requestedId)!; return { model: identity.name, id: identity.id, points: historyFor(boards, identity.id) }; });
  return NextResponse.json({ data, meta: apiMeta({ category, from, to, interval, models: ids }) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
