import { NextResponse } from "next/server.js";
import { apiMeta, boardAt, parseDay, today, validCategory } from "../../_lib/history.ts";
import { publicRateLimit, rateLimitResponse } from "../../../_lib/rate-limit.ts";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limited = await publicRateLimit(request, "leaderboard-history");
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const { slug } = await params;
  if (!validCategory(slug)) return NextResponse.json({ error: { code: "category_not_found", message: `Unknown category: ${slug}` } }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const at = parseDay(query.get("at"), today());
  if (at > today()) return NextResponse.json({ error: { code: "date_out_of_range", message: "at cannot be in the future" } }, { status: 400 });
  const limit = Math.min(100, Math.max(1, Number(query.get("limit")) || 100));
  const data = (await boardAt(slug, at)).slice(0, limit);
  return NextResponse.json({ data, meta: apiMeta({ category: slug, at, count: data.length }) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
