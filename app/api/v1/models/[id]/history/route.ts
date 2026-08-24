import { NextResponse } from "next/server";
import { categories } from "../../../../../data";
import { sql } from "../../../../_lib/db";
import { apiMeta, boardsAcross, daysAgo, historyFor, parseDay, today, validCategory } from "../../../_lib/history";
import { publicRateLimit, rateLimitResponse } from "../../../../_lib/rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await publicRateLimit(request, "model-history", 60);
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const { id } = await params;
  const rows = sql ? await sql`select id, canonical_slug, api_id, default_model_id, name, provider, released_at from active_model_catalog where id = ${id} or canonical_slug = ${id} or api_id = ${id} or default_model_id = ${id}` : [];
  if (rows.length > 1) return NextResponse.json({ error: { code: "ambiguous_model_alias", message: `Ambiguous model alias: ${id}` } }, { status: 409 });
  const model = rows[0];
  if (!model) return NextResponse.json({ error: { code: "model_not_found", message: `Unknown model: ${id}` } }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const requestedCategory = query.get("category");
  const selectedCategories = requestedCategory ? requestedCategory.split(",").filter(validCategory) : categories.map((item) => item.slug);
  if (!selectedCategories.length) return NextResponse.json({ error: { code: "category_not_found", message: "No valid categories requested" } }, { status: 400 });
  const from = parseDay(query.get("from"), daysAgo(30));
  const to = parseDay(query.get("to"), today());
  const interval = query.get("interval") === "week" ? "week" : "day";
  if (from > to || to > today()) return NextResponse.json({ error: { code: "invalid_range", message: "The requested date range is invalid" } }, { status: 400 });
  try {
    const boards = await boardsAcross(selectedCategories, from, to, interval);
    const stableId = String(model.default_model_id ?? model.canonical_slug);
    const series = Object.fromEntries(selectedCategories.map((category) => [category, historyFor(boards.filter((board) => board.category === category), stableId)]));
    const releasedAt = model.released_at ? new Date(model.released_at).toISOString().slice(0, 10) : null;
    const events = releasedAt ? [{ date: releasedAt, type: "catalog_entry", title: `${model.name} entered the tracked catalog` }] : [];
    return NextResponse.json({ data: { model: { id: stableId, canonicalSlug: model.canonical_slug, apiId: model.api_id, name: model.name, provider: model.provider, releasedAt }, series, events }, meta: apiMeta({ from, to, interval, categories: selectedCategories }) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ error: { code: "range_too_large", message: "Request no more than 92 points per series" } }, { status: 400 });
    console.error("Unable to read model history", error);
    return NextResponse.json({ error: { code: "history_unavailable", message: "Historical data is temporarily unavailable" } }, { status: 503 });
  }
}
