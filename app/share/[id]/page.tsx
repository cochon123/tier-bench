"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { categories, Tier, tierMeta } from "../../data";
import { Footer, Header, ModelPill } from "../../components";
import type { CatalogApiModel } from "../../lib/model-catalog";
import { useModelCatalog } from "../../use-model-catalog";

type Snapshot = { id: string; category: string; revision: number; placements: Record<string, Tier | null>; createdAt: string; models?: CatalogApiModel[] };
const noPinnedModels: CatalogApiModel[] = [];

export default function SharedPage() {
  const params = useParams<{ id: string }>(); const [snapshot, setSnapshot] = useState<Snapshot | null | undefined>(undefined);
  const { availableModels } = useModelCatalog(snapshot?.models ?? noPinnedModels);
  useEffect(() => { fetch(`/api/shares/${encodeURIComponent(params.id)}`).then((response) => response.ok ? response.json() : null).then((data) => setSnapshot(data?.snapshot ?? null)).catch(() => setSnapshot(null)); }, [params.id]);
  if (snapshot === undefined) return <><Header /><main className="page-intro"><p>Loading local snapshot…</p></main></>;
  if (!snapshot) return <><Header /><main className="page-intro"><span className="kicker">Snapshot not found</span><h1>This share link is unavailable.</h1><p>It may have expired or never been created.</p><Link className="button" href="/rank">Make a ballot</Link></main></>;
  const tiers = Object.keys(tierMeta) as Tier[]; const category = categories.find(item => item.slug === snapshot.category);
  return <><Header /><main className="page-shell"><header className="page-intro"><span className="kicker">Immutable snapshot · revision {snapshot.revision} · {new Date(snapshot.createdAt).toLocaleDateString()}</span><h1>{category?.name} ballot</h1><p>This revision won’t change when its author edits a later ballot.</p></header><section className="board-section"><div className="tier-board">{tiers.map(tier => <div className="tier-row" key={tier}><div className="tier-label" style={{ background:tierMeta[tier].color }}><strong>{tier}</strong><span>personal</span></div><div className="tier-models">{availableModels.filter(model => snapshot.placements[model.id] === tier).map(model => <ModelPill key={model.id} model={model} />)}</div></div>)}</div></section></main><Footer /></>;
}
