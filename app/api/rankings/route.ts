import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

type Placements = Record<string, string | null>;

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const category = new URL(request.url).searchParams.get("category") ?? "overall";
  const user = await (await clerkClient()).users.getUser(userId);
  const rankings = (user.privateMetadata.rankings as Record<string, Placements> | undefined) ?? {};
  return NextResponse.json({ placements: rankings[category] ?? null });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { category?: string; placements?: Placements };
  if (!body.category || !body.placements || typeof body.placements !== "object") {
    return NextResponse.json({ error: "Category and placements are required" }, { status: 400 });
  }
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const rankings = (user.privateMetadata.rankings as Record<string, Placements> | undefined) ?? {};
  rankings[body.category] = body.placements;
  await client.users.updateUserMetadata(userId, { privateMetadata: { rankings } });
  return NextResponse.json({ saved: true });
}
