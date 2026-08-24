import { NextResponse } from "next/server";
import { categories } from "../../../data";
import { apiMeta, boardAt } from "../_lib/history";

export async function GET() {
  const data = await Promise.all(categories.map(async (category) => {
    const board = await boardAt(category.slug);
    return { ...category, href: `/api/v1/leaderboards/${category.slug}`, modelsRanked: board.length, voters: Math.max(0, ...board.map((item) => item.voters)), leader: board[0] ? { id: board[0].id, name: board[0].name, score: board[0].score } : null };
  }));
  return NextResponse.json({ data, meta: apiMeta({ count: data.length }) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
