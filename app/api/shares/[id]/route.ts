import { NextResponse } from "next/server";
import { databaseUnavailable, sql } from "../../_lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sql) return databaseUnavailable();
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) return NextResponse.json({ error: "Share not found" }, { status: 404 });
  try {
    const rows = await sql`select id, category_slug, revision, placements, created_at from share_snapshots where id = ${id} limit 1`;
    if (!rows.length) return NextResponse.json({ error: "Share not found" }, { status: 404 });
    return NextResponse.json({ snapshot: { id: rows[0].id, category: rows[0].category_slug, revision: rows[0].revision, placements: rows[0].placements, createdAt: rows[0].created_at } }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=3600" } });
  } catch (error) {
    console.error("Unable to read share snapshot", error);
    return NextResponse.json({ error: "Unable to read share snapshot" }, { status: 503 });
  }
}
