import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { databaseUnavailable, sql } from "../_lib/db";
import { rateLimit, rateLimitResponse } from "../_lib/rate-limit";
import { turnstileResponse, verifyTurnstile } from "../_lib/turnstile";
import { validCategory, validatePlacements } from "../_lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sql) return databaseUnavailable();
  const category = new URL(request.url).searchParams.get("category") ?? "overall";
  if (!validCategory(category)) return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  try {
    const rows = await sql`select placements, revision, updated_at from ballots where user_id = ${userId} and category_slug = ${category} limit 1`;
    const ballot = rows[0];
    return NextResponse.json({ placements: ballot?.placements ?? null, revision: ballot?.revision ?? null, updatedAt: ballot?.updated_at ?? null });
  } catch (error) {
    console.error("Unable to read ballot", error);
    return NextResponse.json({ error: "Unable to read ballot" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sql) return databaseUnavailable();
  const limited = await rateLimit(`ballot:${userId}`, 30, 60_000);
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  const input = body as { category?: unknown; placements?: unknown; turnstileToken?: unknown };
  if (!await verifyTurnstile(request, input.turnstileToken)) return turnstileResponse();
  if (!validCategory(input.category)) return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  const category = input.category as string;
  const result = validatePlacements(input.placements);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (result.rankedCount < 5) return NextResponse.json({ error: "At least five models must be ranked before saving a ballot" }, { status: 400 });

  try {
    const saved = await sql.begin(async (tx) => {
      const ids = Object.keys(result.placements);
      const catalog = ids.length ? await tx`
        select id, canonical_slug, api_id, default_model_id
        from active_model_catalog
        where id = any(${ids}) or canonical_slug = any(${ids}) or api_id = any(${ids}) or default_model_id = any(${ids})
      ` : [];
      const known = new Set(catalog.flatMap((row) => [row.id, row.canonical_slug, row.api_id, row.default_model_id].filter(Boolean).map(String)));
      const unknown = ids.filter((id) => !known.has(id));
      if (unknown.length) return { invalidModels: unknown };
      await tx`select pg_advisory_xact_lock(hashtext(${`${userId}:${category}`}))`;
      const existing = await tx`select id, revision from ballots where user_id = ${userId} and category_slug = ${category} for update`;
      const revision = Number(existing[0]?.revision ?? 0) + 1;
      const rows = await tx`
        insert into ballots (user_id, category_slug, placements, ranked_count, revision)
        values (${userId}, ${category}, ${tx.json(result.placements)}, ${result.rankedCount}, ${revision})
        on conflict (user_id, category_slug) do update set
          placements = excluded.placements,
          ranked_count = excluded.ranked_count,
          revision = excluded.revision,
          updated_at = now()
        returning id, revision, updated_at
      `;
      const ballot = rows[0];
      await tx`
        insert into ballot_revisions (ballot_id, user_id, category_slug, revision, placements, ranked_count)
        values (${ballot.id}, ${userId}, ${category}, ${revision}, ${tx.json(result.placements)}, ${result.rankedCount})
      `;
      return ballot;
    });
    if ("invalidModels" in saved) return NextResponse.json({ error: `Unknown or inactive model: ${saved.invalidModels[0]}` }, { status: 400 });
    return NextResponse.json({ saved: true, revision: Number(saved.revision), updatedAt: saved.updated_at });
  } catch (error) {
    console.error("Unable to save ballot", error);
    return NextResponse.json({ error: "Unable to save ballot" }, { status: 503 });
  }
}
