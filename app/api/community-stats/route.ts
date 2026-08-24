import { clerkClient } from "@clerk/nextjs/server";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { categories, leaderboard, models } from "../../data";

type Placements = Record<string, string | null>;
type Rankings = Record<string, Placements>;

export const dynamic = "force-dynamic";

const getCommunitySnapshot = unstable_cache(async (category: string, modelId: string | null) => {
  const board = leaderboard(category);
  const snapshotCount = modelId
    ? board.find((model) => model.id === modelId)?.voters ?? 0
    : Math.max(...board.map((model) => model.voters));

  let liveCount = 0;
  try {
    const client = await clerkClient();
    let offset = 0;
    const limit = 500;

    while (true) {
      const page = await client.users.getUserList({ limit, offset });
      for (const user of page.data) {
        const rankings = user.privateMetadata.rankings as Rankings | undefined;
        const placements = rankings?.[category];
        if (!placements) continue;
        const rankedIds = Object.entries(placements).filter(([, tier]) => tier !== null).map(([id]) => id);
        if (modelId ? rankedIds.includes(modelId) : rankedIds.length > 0) liveCount += 1;
      }
      offset += page.data.length;
      if (page.data.length === 0 || offset >= page.totalCount) break;
    }
  } catch {
    // The local demo has no Clerk backend. Keep showing the latest seeded snapshot.
  }

  return { people: snapshotCount + liveCount, generatedAt: new Date().toISOString() };
}, ["community-stats-v1"], { revalidate: 300 });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requestedCategory = params.get("category") ?? "overall";
  const category = categories.some((item) => item.slug === requestedCategory) ? requestedCategory : "overall";
  const requestedModelId = params.get("modelId");
  const modelId = models.some((model) => model.id === requestedModelId) ? requestedModelId : null;
  const snapshot = await getCommunitySnapshot(category, modelId);

  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=300" },
  });
}
