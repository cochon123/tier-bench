import { NextResponse } from "next/server";
import { catalogRowToApiModel } from "../../../lib/model-catalog";
import type { CatalogRow } from "../../../lib/model-catalog";
import { databaseUnavailable, sql } from "../../_lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sql) return databaseUnavailable();
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) return NextResponse.json({ error: "Share not found" }, { status: 404 });
  try {
    const rows = await sql`select id, category_slug, revision, placements, created_at from share_snapshots where id = ${id} limit 1`;
    if (!rows.length) return NextResponse.json({ error: "Share not found" }, { status: 404 });
    const placements = rows[0].placements && typeof rows[0].placements === "object" ? rows[0].placements as Record<string, unknown> : {};
    const modelIds = Object.keys(placements);
    const catalogRows = modelIds.length ? await sql`
      select c.id, c.canonical_slug, c.api_id, m.default_model_id, c.name, c.provider,
        c.released_at, c.context_length, c.context_window, c.pricing_json, c.pricing,
        c.description, c.status, c.logo_url, c.input_modalities, c.output_modalities
      from model_catalog c
      left join model_default_mappings m on m.canonical_slug = c.canonical_slug
      where c.id = any(${modelIds})
        or c.canonical_slug = any(${modelIds})
        or c.api_id = any(${modelIds})
        or m.default_model_id = any(${modelIds})
    ` as CatalogRow[] : [];
    const models = catalogRows.map(catalogRowToApiModel);
    return NextResponse.json({ snapshot: { id: rows[0].id, category: rows[0].category_slug, revision: rows[0].revision, placements, models, createdAt: rows[0].created_at } }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=3600" } });
  } catch (error) {
    console.error("Unable to read share snapshot", error);
    return NextResponse.json({ error: "Unable to read share snapshot" }, { status: 503 });
  }
}
