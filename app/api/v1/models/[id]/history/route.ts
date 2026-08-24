import { NextResponse } from "next/server";
import { categories } from "../../../../../data";
import { sql } from "../../../../_lib/db";
import { apiMeta, boardsAcross, daysAgo, historyFor, parseDay, today, validCategory } from "../../../_lib/history";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = sql ? await sql`select id, canonical_slug, api_id, default_model_id, name, provider, created_at from active_model_catalog where id = ${id} or canonical_slug = ${id} or api_id = ${id} or default_model_id = ${id} limit 1` : [];
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
    const boards = await Promise.all(selectedCategories.map(async (category) => [category, await boardsAcross(category, from, to, interval)] as const));
    const series = Object.fromEntries(boards.map(([category, points]) => [category, historyFor(points, id)]));
    const releasedAt = model.created_at ? new Date(model.created_at).toISOString().slice(0, 10) : null;
    const events = releasedAt ? [{ date: releasedAt, type: "catalog_entry", title: `${model.name} entered the tracked catalog` }] : [];
    return NextResponse.json({ data: { model: { id, name: model.name, provider: model.provider, releasedAt }, series, events }, meta: apiMeta({ from, to, interval, categories: selectedCategories }) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch { return NextResponse.json({ error: { code: "range_too_large", message: "Request no more than 92 points per series" } }, { status: 400 }); }
}
