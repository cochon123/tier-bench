import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { buildCatalogSyncPlan, fetchOpenRouterCatalog } from "../../../../lib/openrouter-catalog";
import { databaseUnavailable, sql } from "../../../_lib/db";
import { rateLimit, rateLimitResponse } from "../../../_lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}

function adminAuthorized(userId: string | null): boolean {
  if (!userId) return false;
  const ids = (process.env.ADMIN_CLERK_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return ids.includes(userId);
}

/**
 * Idempotent OpenRouter catalog sync. The endpoint accepts either an owner
 * Clerk session or the CRON_SECRET used by the scheduler. Every retry writes
 * the same canonical release with an upsert and leaves default mappings alone.
 */
export async function POST(request: Request) {
  const cron = cronAuthorized(request);
  const { userId } = cron ? { userId: null } : await auth();
  if (!cron && !adminAuthorized(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!sql) return databaseUnavailable();
  if (process.env.OPENROUTER_CATALOG_SYNC_ENABLED === "false") {
    return NextResponse.json({ error: "OpenRouter catalog sync is disabled" }, { status: 503 });
  }

  const limited = rateLimit(`catalog-sync:${userId ?? "cron"}`, 2, 60_000);
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  let runId: number | null = null;
  try {
    const started = await sql`insert into model_catalog_sync_runs (status) values ('running') returning id`;
    runId = Number(started[0]?.id);
    const upstream = await fetchOpenRouterCatalog({
      minimumModels: Math.max(1, Number(process.env.OPENROUTER_MIN_CATALOG_MODELS ?? 10)),
    });
    const plan = buildCatalogSyncPlan(upstream, Math.max(1, Number(process.env.OPENROUTER_MIN_CATALOG_MODELS ?? 10)));

    const imported = await sql.begin(async (tx) => {
      let count = 0;
      for (const model of plan.models) {
        await tx`
          insert into model_catalog (
            id, canonical_slug, api_id, name, provider, context_window,
            context_length, pricing, pricing_json, description, modality,
            input_modalities, output_modalities, metadata, raw, source,
            status, active, last_seen_at, updated_at
          ) values (
            ${model.canonicalSlug}, ${model.canonicalSlug}, ${model.apiId},
            ${model.name}, ${model.provider}, ${model.contextLength === null ? null : String(model.contextLength)},
            ${model.contextLength}, ${JSON.stringify(model.pricing)}, ${JSON.stringify(model.pricing)},
            ${model.description}, ${model.modality}, ${tx.json(JSON.parse(JSON.stringify(model.inputModalities)))},
            ${tx.json(JSON.parse(JSON.stringify(model.outputModalities)))}, ${tx.json(JSON.parse(JSON.stringify({ topProvider: model.topProvider, perRequestLimits: model.perRequestLimits, supportedParameters: model.supportedParameters })))},
            ${tx.json(JSON.parse(JSON.stringify(model.raw)))}, 'openrouter', 'active',
            true, now(), now()
          )
          on conflict (canonical_slug) do update set
            api_id = excluded.api_id,
            name = excluded.name,
            provider = excluded.provider,
            context_window = excluded.context_window,
            context_length = excluded.context_length,
            pricing = excluded.pricing,
            pricing_json = excluded.pricing_json,
            description = excluded.description,
            modality = excluded.modality,
            input_modalities = excluded.input_modalities,
            output_modalities = excluded.output_modalities,
            metadata = excluded.metadata,
            raw = excluded.raw,
            source = 'openrouter',
            status = case when model_catalog.status = 'hidden' then 'hidden' else 'active' end,
            is_default = false,
            last_seen_at = now(),
            updated_at = now()
        `;
        await tx`
          insert into model_catalog_aliases (canonical_slug, api_id)
          values (${model.canonicalSlug}, ${model.apiId})
          on conflict (canonical_slug, api_id) do update set last_seen_at = now()
        `;
        count += 1;
      }
      return count;
    });

    await sql`
      update model_catalog_sync_runs
      set completed_at = now(), status = 'succeeded', fetched_count = ${plan.fetchedCount},
          text_model_count = ${plan.textModelCount}, imported_count = ${imported}, error = null
      where id = ${runId}
    `;
    return NextResponse.json({ ok: true, runId, fetched: plan.fetchedCount, textModels: plan.textModelCount, imported });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog sync failed";
    console.error("OpenRouter catalog sync failed", error);
    if (runId !== null) {
      try { await sql`update model_catalog_sync_runs set completed_at = now(), status = 'failed', error = ${message} where id = ${runId}`; } catch (updateError) { console.error("Unable to record catalog sync failure", updateError); }
    }
    return NextResponse.json({ error: "OpenRouter catalog sync failed", detail: message }, { status: 502 });
  }
}
