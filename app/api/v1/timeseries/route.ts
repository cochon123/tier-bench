import { NextResponse } from "next/server";
import { models } from "../../../data";
import { apiMeta, DATA_END, DATA_START, modelHistory, parseDay, validCategory } from "../_lib/history";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const ids = (query.get("models") ?? "").split(",").filter((id) => models.some((model) => model.id === id)).slice(0, 10);
  const category = query.get("category") ?? "overall";
  if (!ids.length) return NextResponse.json({ error: { code: "models_required", message: "Pass 1–10 comma-separated model IDs in ?models=" } }, { status: 400 });
  if (!validCategory(category)) return NextResponse.json({ error: { code: "category_not_found", message: `Unknown category: ${category}` } }, { status: 404 });
  const from = parseDay(query.get("from"), DATA_START);
  const to = parseDay(query.get("to"), DATA_END);
  const interval = query.get("interval") === "week" ? "week" : "day";
  const data = ids.map((id) => ({ model: models.find((item) => item.id === id)!.name, id, points: modelHistory(id, category, from, to, interval) }));
  return NextResponse.json({ data, meta: apiMeta({ category, from, to, interval, models: ids }) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
