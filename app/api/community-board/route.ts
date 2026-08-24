import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { categories, models, tierMeta, Tier } from "../../data";

type Placements = Record<string, string | null>;
type Rankings = Record<string, Placements>;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("category") ?? "overall";
  const category = categories.some((item) => item.slug === requested) ? requested : "overall";
  const totals: Record<string, { sum: number; voters: number }> = {};
  models.forEach((model) => { totals[model.id] = { sum: 0, voters: 0 }; });

  try {
    const client = await clerkClient();
    let offset = 0;
    const limit = 500;
    while (true) {
      const page = await client.users.getUserList({ limit, offset });
      for (const user of page.data) {
        const placements = (user.privateMetadata.rankings as Rankings | undefined)?.[category];
        if (!placements) continue;
        for (const [modelId, tier] of Object.entries(placements)) {
          if (!tier || !(tier in tierMeta) || !totals[modelId]) continue;
          totals[modelId].sum += tierMeta[tier as Tier].score;
          totals[modelId].voters += 1;
        }
      }
      offset += page.data.length;
      if (page.data.length === 0 || offset >= page.totalCount) break;
    }
  } catch {
    return NextResponse.json({ scores: {} });
  }

  const scores = Object.fromEntries(Object.entries(totals).filter(([, value]) => value.voters > 0).map(([id, value]) => [id, { score: value.sum / value.voters, voters: value.voters }]));
  return NextResponse.json({ scores }, { headers: { "Cache-Control": "no-store" } });
}
