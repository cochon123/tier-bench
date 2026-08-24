import { NextResponse } from "next/server";
import { apiMeta, boardAt, DATA_END, DATA_START, parseDay, validCategory } from "../../_lib/history";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!validCategory(slug)) return NextResponse.json({ error: { code: "category_not_found", message: `Unknown category: ${slug}` } }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const at = parseDay(query.get("at"), DATA_END);
  if (at < DATA_START || at > DATA_END) return NextResponse.json({ error: { code: "date_out_of_range", message: `at must be between ${DATA_START} and ${DATA_END}` } }, { status: 400 });
  const limit = Math.min(100, Math.max(1, Number(query.get("limit")) || 100));
  const data = boardAt(slug, at).slice(0, limit).map(({ id, name, maker, release, score, tier, rank, voters, confidence, distribution }) => ({ id, name, provider: maker, releasedAt: release, rank, tier, score, voters, confidence, distribution }));
  return NextResponse.json({ data, meta: apiMeta({ category: slug, at, count: data.length }) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
