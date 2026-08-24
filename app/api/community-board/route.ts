import { NextResponse } from "next/server";
import { databaseUnavailable, sql } from "../_lib/db";
import { validCategory } from "../_lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("category") ?? "overall";
  if (!validCategory(requested)) return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  if (!sql) return databaseUnavailable();
  let rows: { model_id: string; score: number; voters: number }[];
  try {
    rows = await sql`
      select placement.model_id,
        avg(case placement.tier
          when 'S' then 6 when 'A' then 5 when 'B' then 4
          when 'C' then 3 when 'D' then 2 when 'F' then 1 end)::float as score,
        count(*)::int as voters
      from ballots b
      cross join lateral jsonb_each_text(b.placements) as placement(model_id, tier)
      where b.category_slug = ${requested} and placement.tier in ('S', 'A', 'B', 'C', 'D', 'F')
      group by placement.model_id
    `;
  } catch (error) {
    console.error("Unable to read community board", error);
    return NextResponse.json({ error: "Unable to read community board" }, { status: 503 });
  }
  const scores = Object.fromEntries(rows.map((row) => [row.model_id, { score: Number(row.score), voters: Number(row.voters) }]));
  return NextResponse.json({ scores }, { headers: { "Cache-Control": "no-store" } });
}
