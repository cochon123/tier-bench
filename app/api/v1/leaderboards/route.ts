import { NextResponse } from "next/server";
import { categories } from "../../../data";
import { publicRateLimit, rateLimitResponse } from "../../_lib/rate-limit";
import { apiMeta, boardsAcross, today } from "../_lib/history";

export async function GET(request: Request) {
  const limited = await publicRateLimit(request, "leaderboards");
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const at = today();
  const snapshots = await boardsAcross(categories.map((category) => category.slug), at, at, "day");
  const data = categories.map((category) => {
    const board = snapshots.find((snapshot) => snapshot.category === category.slug)?.board ?? [];
    return { ...category, href: `/api/v1/leaderboards/${category.slug}`, modelsRanked: board.length, voters: Math.max(0, ...board.map((item) => item.voters)), leader: board[0] ? { id: board[0].id, name: board[0].name, score: board[0].score } : null };
  });
  return NextResponse.json({ data, meta: apiMeta({ count: data.length }) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
