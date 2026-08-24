import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { databaseUnavailable, sql } from "../../../_lib/db";
import { rateLimit, rateLimitResponse } from "../../../_lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sql) return databaseUnavailable();
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid proposal id" }, { status: 400 });
  const limited = rateLimit(`proposal-vote:${userId}`, 60, 60_000);
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  try {
    const result = await sql.begin(async (tx) => {
      const proposal = await tx`select id from proposals where id = ${Number(id)} for update`;
      if (!proposal.length) return null;
      const existing = await tx`select 1 from proposal_votes where proposal_id = ${Number(id)} and user_id = ${userId}`;
      if (existing.length) await tx`delete from proposal_votes where proposal_id = ${Number(id)} and user_id = ${userId}`;
      else await tx`insert into proposal_votes (proposal_id, user_id) values (${Number(id)}, ${userId})`;
      const count = await tx`select count(*)::int as votes from proposal_votes where proposal_id = ${Number(id)}`;
      return { voted: !existing.length, votes: Number(count[0].votes) };
    });
    if (!result) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Unable to vote on proposal", error);
    return NextResponse.json({ error: "Unable to vote on proposal" }, { status: 503 });
  }
}
