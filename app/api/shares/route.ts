import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { databaseUnavailable, sql } from "../_lib/db";
import { rateLimit, rateLimitResponse } from "../_lib/rate-limit";
import { validCategory, validatePlacements } from "../_lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sql) return databaseUnavailable();
  const limited = rateLimit(`share:${userId}`, 20, 60_000);
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const input = body as { category?: unknown; placements?: unknown };
  if (!validCategory(input?.category)) return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  const result = validatePlacements(input.placements);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (result.rankedCount < 5) return NextResponse.json({ error: "At least five models must be ranked before sharing" }, { status: 400 });
  const id = randomUUID().replaceAll("-", "");
  try {
    const rows = await sql`select id, revision from ballots where user_id = ${userId} and category_slug = ${input.category} limit 1`;
    const ballot = rows[0];
    const snapshot = await sql`
      insert into share_snapshots (id, ballot_id, user_id, category_slug, revision, placements)
      values (${id}, ${ballot?.id ?? null}, ${userId}, ${input.category}, ${Number(ballot?.revision ?? 0)}, ${sql.json(result.placements)})
      returning id, category_slug, revision, placements, created_at
    `;
    return NextResponse.json({ snapshot: { ...snapshot[0], id: snapshot[0].id, category: snapshot[0].category_slug, createdAt: snapshot[0].created_at } }, { status: 201 });
  } catch (error) {
    console.error("Unable to create share snapshot", error);
    return NextResponse.json({ error: "Unable to create share snapshot" }, { status: 503 });
  }
}
