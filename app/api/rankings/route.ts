import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { databaseUnavailable, sql } from "../_lib/db";
import { rateLimit, rateLimitResponse } from "../_lib/rate-limit";
import { turnstileResponse, verifyTurnstile } from "../_lib/turnstile";
import { enforceRetiredModelPolicy, normalizeCatalogPlacements, validCategory, validatePlacements } from "../_lib/validation";
import { catalogRowToApiModel } from "../../lib/model-catalog";
import type { CatalogRow } from "../../lib/model-catalog";

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
    const placements = ballot?.placements && typeof ballot.placements === "object" ? ballot.placements as Record<string, unknown> : null;
    const ids = placements ? Object.keys(placements) : [];
    const catalog = ids.length ? await sql`
      select c.id, c.canonical_slug, c.api_id, m.default_model_id, c.name, c.provider,
        c.released_at, c.context_length, c.context_window, c.pricing_json, c.pricing,
        c.description, c.status, c.logo_url, c.input_modalities, c.output_modalities
      from model_catalog c left join model_default_mappings m on m.canonical_slug = c.canonical_slug
      where c.id = any(${ids}) or c.canonical_slug = any(${ids}) or c.api_id = any(${ids}) or m.default_model_id = any(${ids})
    ` as CatalogRow[] : [];
    return NextResponse.json({ placements, models: catalog.map(catalogRowToApiModel), revision: ballot?.revision ?? null, updatedAt: ballot?.updated_at ?? null });
  } catch (error) {
    console.error("Unable to read ballot", error);
    return NextResponse.json({ error: "Unable to read ballot" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sql) return databaseUnavailable();
  let limited: Awaited<ReturnType<typeof rateLimit>>;
  try {
    limited = await rateLimit(`ballot:${userId}`, 30, 60_000);
  } catch (error) {
    console.error("Unable to apply ballot rate limit", error);
    return NextResponse.json({ error: "The save service is not ready. Please run the database migrations and try again." }, { status: 503 });
  }
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
      await tx`select pg_advisory_xact_lock(hashtext(${`${userId}:${category}`}))`;
      const existing = await tx`select id, revision, placements from ballots where user_id = ${userId} and category_slug = ${category} for update`;
      const existingPlacements = existing[0]?.placements && typeof existing[0].placements === "object" ? existing[0].placements as Record<string, string | null> : {};
      const ids = [...new Set([...Object.keys(result.placements), ...Object.keys(existingPlacements)])];
      const catalog = ids.length ? await tx`
        select c.id, c.canonical_slug, c.api_id, m.default_model_id, c.active, c.status
        from model_catalog c left join model_default_mappings m on m.canonical_slug = c.canonical_slug and m.active
        where c.id = any(${ids}) or c.canonical_slug = any(${ids}) or c.api_id = any(${ids}) or m.default_model_id = any(${ids})
        for share of c
      ` : [];
      const normalized = normalizeCatalogPlacements(result.placements, catalog as Array<{ id: string; canonical_slug: string; api_id: string; default_model_id: string | null }>);
      if (!normalized.ok) return { validationError: normalized.error };
      const normalizedExisting = normalizeCatalogPlacements(existingPlacements, catalog as Array<{ id: string; canonical_slug: string; api_id: string; default_model_id: string | null }>);
      const prior = normalizedExisting.ok ? normalizedExisting.placements : existingPlacements;
      const selectable = new Set(catalog.filter((row) => row.active && row.status === "active").map((row) => String(row.default_model_id ?? row.canonical_slug)));
      const policy = enforceRetiredModelPolicy(normalized.placements, prior, selectable);
      if (!policy.ok) return { validationError: policy.error };
      if (policy.rankedCount < 5) return { validationError: "At least five distinct models must be ranked before saving a ballot" };
      const revision = Number(existing[0]?.revision ?? 0) + 1;
      const rows = await tx`
        insert into ballots (user_id, category_slug, placements, ranked_count, revision)
        values (${userId}, ${category}, ${tx.json(policy.placements)}, ${policy.rankedCount}, ${revision})
        on conflict (user_id, category_slug) do update set
          placements = excluded.placements,
          ranked_count = excluded.ranked_count,
          revision = excluded.revision,
          updated_at = now()
        returning id, placements, revision, updated_at
      `;
      const ballot = rows[0];
      await tx`
        insert into ballot_revisions (ballot_id, user_id, category_slug, revision, placements, ranked_count)
        values (${ballot.id}, ${userId}, ${category}, ${revision}, ${tx.json(policy.placements)}, ${policy.rankedCount})
      `;
      return ballot;
    });
    if ("validationError" in saved) return NextResponse.json({ error: saved.validationError }, { status: 400 });
    return NextResponse.json({ saved: true, placements: saved.placements, revision: Number(saved.revision), updatedAt: saved.updated_at });
  } catch (error) {
    console.error("Unable to save ballot", error);
    return NextResponse.json({ error: "Unable to save ballot" }, { status: 503 });
  }
}
