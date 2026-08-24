import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { databaseUnavailable, sql } from "../../_lib/db";
import { rateLimit, rateLimitResponse } from "../../_lib/rate-limit";
import { validateText } from "../../_lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ modelId: string }> }) {
  if (!sql) return databaseUnavailable();
  const { modelId } = await params;
  if (!modelId || modelId.length > 200) return NextResponse.json({ error: "Invalid model id" }, { status: 400 });
  try {
    const rows = await sql`select id, body, created_at from model_comments where model_id = ${modelId} order by created_at desc limit 100`;
    return NextResponse.json({ comments: rows.map((row) => ({ id: String(row.id), alias: "Anonymous member", body: row.body, createdAt: row.created_at })) });
  } catch (error) {
    console.error("Unable to read comments", error);
    return NextResponse.json({ error: "Unable to read comments" }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ modelId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sql) return databaseUnavailable();
  const { modelId } = await params;
  if (!modelId || modelId.length > 200) return NextResponse.json({ error: "Invalid model id" }, { status: 400 });
  const limited = await rateLimit(`comment:${userId}`, 10, 3_600_000);
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const text = validateText((body as { body?: unknown })?.body, "body", 500);
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });
  try {
    const rows = await sql`insert into model_comments (model_id, user_id, body) values (${modelId}, ${userId}, ${text.value}) returning id, body, created_at`;
    return NextResponse.json({ comment: { id: String(rows[0].id), alias: "Anonymous member", body: rows[0].body, createdAt: rows[0].created_at } }, { status: 201 });
  } catch (error) {
    console.error("Unable to create comment", error);
    return NextResponse.json({ error: "Unable to create comment" }, { status: 503 });
  }
}
