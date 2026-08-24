import { NextResponse } from "next/server";
import { categories, models } from "../../../../../data";
import { apiMeta, DATA_END, DATA_START, modelHistory, modelReleaseDay, parseDay, validCategory } from "../../../_lib/history";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = models.find((item) => item.id === id);
  if (!model) return NextResponse.json({ error: { code: "model_not_found", message: `Unknown model: ${id}` } }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const requestedCategory = query.get("category");
  const selectedCategories = requestedCategory ? requestedCategory.split(",").filter(validCategory) : categories.map((item) => item.slug);
  if (!selectedCategories.length) return NextResponse.json({ error: { code: "category_not_found", message: "No valid categories requested" } }, { status: 400 });
  const from = parseDay(query.get("from"), modelReleaseDay(id) > DATA_START ? modelReleaseDay(id) : DATA_START);
  const to = parseDay(query.get("to"), DATA_END);
  const interval = query.get("interval") === "week" ? "week" : "day";
  if (from > to || from > DATA_END || to < DATA_START) return NextResponse.json({ error: { code: "invalid_range", message: "The requested date range is invalid" } }, { status: 400 });
  const series = Object.fromEntries(selectedCategories.map((category) => [category, modelHistory(id, category, from, to, interval)]));
  const events = [{ date: modelReleaseDay(id), type: "release", title: `${model.name} entered the tracked catalog` }];
  return NextResponse.json({ data: { model: { id, name: model.name, provider: model.maker, releasedAt: modelReleaseDay(id) }, series, events }, meta: apiMeta({ from, to, interval, categories: selectedCategories }) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
