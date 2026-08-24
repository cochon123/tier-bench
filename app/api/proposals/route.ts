import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { databaseUnavailable, sql } from "../_lib/db";
import { rateLimit, rateLimitResponse } from "../_lib/rate-limit";
import { validateText } from "../_lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!sql) return databaseUnavailable();
  const { userId } = await auth();
  try {
    const rows = await sql`
      select p.id, p.title, p.description, p.status, p.created_at,
        count(v.proposal_id)::int as votes,
        bool_or(v.user_id = ${userId ?? ""}) as voted
      from proposals p left join proposal_votes v on v.proposal_id = p.id
      group by p.id order by count(v.proposal_id) desc, p.created_at desc
    `;
    return NextResponse.json({ proposals: rows.map((row) => ({ id: String(row.id), title: row.title, description: row.description, votes: Number(row.votes), status: row.status, voted: Boolean(row.voted) })) });
  } catch (error) {
    console.error("Unable to read proposals", error);
    return NextResponse.json({ error: "Unable to read proposals" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sql) return databaseUnavailable();
  const limited = await rateLimit(`proposal-create:${userId}`, 5, 3_600_000);
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const input = body as { title?: unknown; description?: unknown };
  const title = validateText(input?.title, "title", 60);
  const description = validateText(input?.description, "description", 220);
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 });
  if (!description.ok) return NextResponse.json({ error: description.error }, { status: 400 });
  try {
    const rows = await sql`insert into proposals (author_user_id, title, description) values (${userId}, ${title.value}, ${description.value}) returning id, title, description, status, created_at`;
    return NextResponse.json({ proposal: { ...rows[0], id: String(rows[0].id), votes: 0, voted: false } }, { status: 201 });
  } catch (error) {
    console.error("Unable to create proposal", error);
    return NextResponse.json({ error: "Unable to create proposal" }, { status: 503 });
  }
}
