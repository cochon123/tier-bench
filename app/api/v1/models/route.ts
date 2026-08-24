import { NextResponse } from "next/server.js";
import { catalogRowToApiModel, defaultCatalogApiModels } from "../../../lib/model-catalog.ts";
import type { CatalogRow } from "../../../lib/model-catalog.ts";
import { sql } from "../../_lib/db.ts";
import { apiMeta } from "../_lib/history.ts";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const provider = query.get("provider")?.toLowerCase();
  const releasedAfter = query.get("released_after");
  const search = query.get("q")?.toLowerCase();
  const fallback = defaultCatalogApiModels().map((model) => ({ ...model, links: { history: `/api/v1/models/${encodeURIComponent(model.id)}/history` } }));
  let catalog = fallback;
  if (sql) {
    try {
      const rows = await sql`select id, canonical_slug, api_id, default_model_id, name, provider, released_at, context_length, context_window, pricing_json, pricing, description, status, logo_url, input_modalities, output_modalities from active_model_catalog` as CatalogRow[];
      const imported = rows.map((row) => {
        const model = catalogRowToApiModel(row);
        return { ...model, links: { history: `/api/v1/models/${encodeURIComponent(model.id)}/history` } };
      });
      const byId = new Map(imported.map((model) => [model.id, model]));
      // Keep the supplied product-line defaults available even before an
      // admin has matched each line to its canonical OpenRouter slug.
      for (const model of fallback) if (!byId.has(model.id)) byId.set(model.id, model);
      catalog = [...byId.values()];
    } catch (error) {
      // The app remains readable during a first deploy before migrations have
      // run; writes and syncs still fail closed in their own endpoints.
      console.error("Unable to read model catalog", error);
    }
  }
  const data = catalog.filter((model) => (!provider || model.provider.toLowerCase() === provider) && (!releasedAfter || (model.releasedAt ?? "") >= releasedAfter) && (!search || `${model.name} ${model.provider}`.toLowerCase().includes(search)));
  return NextResponse.json({ data, meta: apiMeta({ count: data.length, filters: { provider: provider ?? null, releasedAfter: releasedAfter ?? null, q: search ?? null } }) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
