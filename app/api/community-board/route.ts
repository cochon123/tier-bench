import { NextResponse } from "next/server.js";
import { databaseUnavailable, sql } from "../_lib/db.ts";
import { validCategory } from "../_lib/validation.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("category") ?? "overall";
  if (!validCategory(requested)) return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  if (!sql) return databaseUnavailable();
  let rows: { model_id: string; score: number; voters: number; s_count: number; a_count: number; b_count: number; c_count: number; d_count: number; f_count: number }[];
  try {
    rows = await sql`
      select placement.model_id,
        avg(case placement.tier
          when 'S' then 6 when 'A' then 5 when 'B' then 4
          when 'C' then 3 when 'D' then 2 when 'F' then 1 end)::float as score,
        count(*)::int as voters
        ,count(*) filter (where placement.tier = 'S')::int as s_count
        ,count(*) filter (where placement.tier = 'A')::int as a_count
        ,count(*) filter (where placement.tier = 'B')::int as b_count
        ,count(*) filter (where placement.tier = 'C')::int as c_count
        ,count(*) filter (where placement.tier = 'D')::int as d_count
        ,count(*) filter (where placement.tier = 'F')::int as f_count
      from ballots b
      cross join lateral jsonb_each_text(b.placements) as placement(model_id, tier)
      where b.category_slug = ${requested} and placement.tier in ('S', 'A', 'B', 'C', 'D', 'F')
      group by placement.model_id
    `;
  } catch (error) {
    console.error("Unable to read community board", error);
    return NextResponse.json({ error: "Unable to read community board" }, { status: 503 });
  }
  const scores = Object.fromEntries(rows.map((row) => [row.model_id, {
    score: Number(row.score), voters: Number(row.voters),
    distribution: { S: Number(row.s_count), A: Number(row.a_count), B: Number(row.b_count), C: Number(row.c_count), D: Number(row.d_count), F: Number(row.f_count) },
  }]));
  return NextResponse.json({ scores }, { headers: { "Cache-Control": "no-store" } });
}
