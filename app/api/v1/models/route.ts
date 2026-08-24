import { NextResponse } from "next/server";
import { models } from "../../../data";
import { apiMeta, modelReleaseDay } from "../_lib/history";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const provider = query.get("provider")?.toLowerCase();
  const releasedAfter = query.get("released_after");
  const search = query.get("q")?.toLowerCase();
  const data = models.filter((model) => (!provider || model.maker.toLowerCase() === provider) && (!releasedAfter || modelReleaseDay(model.id) >= releasedAfter) && (!search || `${model.name} ${model.maker}`.toLowerCase().includes(search))).map((model) => ({ id: model.id, name: model.name, provider: model.maker, releasedAt: modelReleaseDay(model.id), contextWindow: model.context, pricing: model.price, description: model.description, status: "active", links: { history: `/api/v1/models/${model.id}/history` } }));
  return NextResponse.json({ data, meta: apiMeta({ count: data.length, filters: { provider: provider ?? null, releasedAfter: releasedAfter ?? null, q: search ?? null } }) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
