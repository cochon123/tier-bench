import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { databaseUnavailable, sql } from "../_lib/db";
import { rateLimit, rateLimitResponse } from "../_lib/rate-limit";
import { validCategory } from "../_lib/validation";
import { turnstileResponse, verifyTurnstile } from "../_lib/turnstile";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sql) return databaseUnavailable();
  const limited = await rateLimit(`share:${userId}`, 20, 60_000);
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const input = body as { category?: unknown; turnstileToken?: unknown };
  if (!await verifyTurnstile(request, input.turnstileToken)) return turnstileResponse();
  if (!validCategory(input?.category)) return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  const category = input.category;
  const id = randomUUID().replaceAll("-", "");
  try {
    const snapshot = await sql.begin(async (tx) => {
      const rows = await tx`
        select b.id, r.revision, r.placements
        from ballots b join ballot_revisions r on r.ballot_id = b.id and r.revision = b.revision
        where b.user_id = ${userId} and b.category_slug = ${category}
        for share of b
        limit 1
      `;
      if (!rows.length) return [];
      return tx`
        insert into share_snapshots (id, ballot_id, user_id, category_slug, revision, placements)
        values (${id}, ${rows[0].id}, ${userId}, ${category}, ${rows[0].revision}, ${tx.json(rows[0].placements)})
        returning id, category_slug, revision, placements, created_at
      `;
    });
    if (!snapshot.length) return NextResponse.json({ error: "Save this ballot before sharing it" }, { status: 409 });
    const row = snapshot[0] as { id: string; category_slug: string; revision: number; placements: unknown; created_at: string | Date };
    return NextResponse.json({ snapshot: { id: row.id, category: row.category_slug, revision: Number(row.revision), placements: row.placements, createdAt: row.created_at } }, { status: 201 });
  } catch (error) {
    console.error("Unable to create share snapshot", error);
    return NextResponse.json({ error: "Unable to create share snapshot" }, { status: 503 });
  }
}
