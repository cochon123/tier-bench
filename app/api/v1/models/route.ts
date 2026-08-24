import { NextResponse } from "next/server";
import { models } from "../../../data";
import { sql } from "../../_lib/db";
import { apiMeta, modelReleaseDay } from "../_lib/history";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const provider = query.get("provider")?.toLowerCase();
  const releasedAfter = query.get("released_after");
  const search = query.get("q")?.toLowerCase();
  const fallback = models.map((model) => ({ id: model.id, name: model.name, provider: model.maker, releasedAt: modelReleaseDay(model.id), contextWindow: model.context, pricing: model.price, description: model.description, status: "active", isDefault: true, links: { history: `/api/v1/models/${model.id}/history` } }));
  let catalog = fallback;
  if (sql) {
    try {
      const rows = await sql`select id, canonical_slug, api_id, default_model_id, name, provider, created_at, context_length, context_window, pricing_json, pricing, description, status from active_model_catalog` as Array<{
        id: string; canonical_slug: string; api_id: string; default_model_id: string | null; name: string; provider: string; created_at: string | Date | null; context_length: number | null; context_window: string | null; pricing_json: Record<string, unknown> | null; pricing: string | null; description: string | null; status: string;
      }>;
      const imported = rows.map((row) => {
        const date = row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : "";
        const pricing = row.pricing ?? (row.pricing_json ? JSON.stringify(row.pricing_json) : "");
        const id = row.default_model_id ?? row.api_id ?? row.canonical_slug ?? row.id;
        return { id, name: row.name, provider: row.provider, releasedAt: date, contextWindow: row.context_window ?? (row.context_length ? `${row.context_length}` : ""), pricing, description: row.description ?? "", status: row.status, isDefault: Boolean(row.default_model_id), links: { history: `/api/v1/models/${id}/history` } };
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
