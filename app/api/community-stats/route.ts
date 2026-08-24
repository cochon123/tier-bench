import { NextResponse } from "next/server";
import { databaseUnavailable, sql } from "../_lib/db";
import { validCategory } from "../_lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requestedCategory = params.get("category") ?? "overall";
  const category = validCategory(requestedCategory) ? requestedCategory : "overall";
  const requestedModelId = params.get("modelId");
  if (!sql) return databaseUnavailable();
  try {
    const rows = requestedModelId
      ? await sql`select count(distinct b.user_id)::int as people from ballots b cross join lateral jsonb_each_text(b.placements) p(model_id, tier) where b.category_slug = ${category} and p.model_id = ${requestedModelId} and p.tier in ('S','A','B','C','D','F')`
      : await sql`select count(distinct user_id)::int as people from ballots where category_slug = ${category} and ranked_count > 0`;
    const snapshot = { people: Number(rows[0]?.people ?? 0), generatedAt: new Date().toISOString() };
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } });
  } catch (error) {
    console.error("Unable to read community stats", error);
    return NextResponse.json({ error: "Unable to read community stats" }, { status: 503 });
  }
}
