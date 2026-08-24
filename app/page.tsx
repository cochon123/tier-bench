"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { categories, leaderboard, models, Tier, tierForScore, tierMeta } from "./data";
import { Footer, Header, ModelMark, RollingNumber } from "./components";
import { useCommunityCount } from "./use-community-count";

function TierCard({ model }: { model: ReturnType<typeof leaderboard>[number] }) {
  return <Link href={`/models/${model.id}`} className={`tier-card tier-${model.tier.toLowerCase()}`}><ModelMark model={model} small /><strong>{model.name}</strong></Link>;
}

const newestModel = [...models].sort((a, b) => new Date(b.release).getTime() - new Date(a.release).getTime())[0];

function BenchmarkPanel({ item, activeModelIds, selected, onSelect }: { item: (typeof categories)[number]; activeModelIds: string[]; selected: boolean; onSelect: () => void }) {
  const results = leaderboard(item.slug).filter((model) => activeModelIds.includes(model.id));
  const tiers = (Object.keys(tierMeta) as Tier[]).map((tier) => ({ tier, models: results.filter((model) => model.tier === tier) }));
  return <button type="button" className={`benchmark-panel ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onSelect}>
    <header className="benchmark-panel-head"><div><strong>{item.name}</strong></div></header><p className="benchmark-panel-prompt">{item.prompt}</p>
    <div className="benchmark-tier-list">{tiers.map(({ tier, models: inTier }) => <div className="benchmark-tier-row" key={tier}><strong className="benchmark-tier-label" style={{ background: tierMeta[tier].color }}>{tier}</strong><div className="benchmark-tier-models">{inTier.length ? inTier.map((model) => <span className="benchmark-model-chip" key={model.id}><ModelMark model={model} small /><b>{model.name}</b></span>) : <span className="benchmark-empty">—</span>}</div></div>)}</div>
    <footer>Click to focus this benchmark <span>↗</span></footer>
  </button>;
}

export default function Home() {
  const { user } = useUser();
  const [rankedNewest, setRankedNewest] = useState(false);
  const [category, setCategory] = useState("overall");
  const [activeModelIds, setActiveModelIds] = useState<string[]>(() => models.map((model) => model.id));
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [communityScores, setCommunityScores] = useState<Record<string, { score: number; voters: number }>>({});
  useEffect(() => { const saved = localStorage.getItem("tier-bench:active-models"); if (saved) setActiveModelIds(JSON.parse(saved)); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setCommunityScores({});
    fetch(`/api/community-board?category=${encodeURIComponent(category)}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : { scores: {} }).then((data) => setCommunityScores(data.scores ?? {})).catch(() => {});
    return () => controller.abort();
  }, [category]);
  const board = useMemo(() => leaderboard(category).map((model) => {
    const live = communityScores[model.id];
    return live ? { ...model, score: live.score, voters: live.voters, tier: tierForScore(live.score) } : model;
  }).filter((model) => activeModelIds.includes(model.id)), [category, activeModelIds, communityScores]);
  const grouped = (Object.keys(tierMeta) as Tier[]).map((tier) => ({ tier, models: board.filter((model) => model.tier === tier) }));
  const active = categories.find((item) => item.slug === category)!;
  const snapshotPeople = Math.max(...board.map((model) => model.voters), 0);
  const { count: people, spinKey: peopleSpinKey } = useCommunityCount(category, snapshotPeople);
  const visibleModels = models.filter((model) => model.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (!user) { setRankedNewest(false); return; }
    const storageKey = "tier-bench:ballot:overall";
    const checkPlacement = (raw: string | null) => {
      if (!raw) return false;
      try {
        const placements = JSON.parse(raw) as Record<string, string | null>;
        return Boolean(placements[newestModel.id]);
      } catch { return false; }
    };
    if (checkPlacement(localStorage.getItem(storageKey))) setRankedNewest(true);
    fetch("/api/rankings?category=overall")
      .then((response) => response.ok ? response.json() as Promise<{ placements: Record<string, string | null> | null }> : null)
      .then((data) => setRankedNewest(Boolean(data?.placements?.[newestModel.id])))
      .catch(() => {});
  }, [user]);

  function toggleModel(id: string) { setActiveModelIds((current) => current.includes(id) ? current.filter((modelId) => modelId !== id) : [...current, id]); }
  function saveModels() { localStorage.setItem("tier-bench:active-models", JSON.stringify(activeModelIds)); setSelectorOpen(false); }
  function loadModels() { const saved = localStorage.getItem("tier-bench:active-models"); if (saved) setActiveModelIds(JSON.parse(saved)); }

  return <><Header /><main className="tier-app">
    <section className="landing-hero">
      <div className="landing-hero-copy">
        <h1>This is not a bench, it is people <em>actual experience.</em></h1>
        <p>tier/bench is a living, community-built guide to the AI models people actually use. Compare the main board, explore focused tierlist, and make a ranking that reflects your own work.</p>
        <div className="landing-actions"><Link className="button acid landing-primary" href="/rank">{user ? rankedNewest ? "Go to your own tier list" : <>Rank the new {newestModel.name} <ModelMark model={newestModel} small /></> : <>Make your own tier list <span>↗</span></>}</Link></div>
      </div>
    </section>
    <section className="tier-toolbar" id="main-board"><div className="tier-title"><h1>AI model tier list</h1></div></section>
    <section className="tier-controls"><div className="tier-global-label">Global tier-list</div><div className="tier-control-selects"><details className="model-manager" open={selectorOpen} onToggle={(event) => setSelectorOpen(event.currentTarget.open)}><summary className="model-manager-trigger">{activeModelIds.length} selected <b>⌄</b></summary><div className="model-popover"><input autoFocus={selectorOpen} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search models..." /><div className="model-popover-list">{visibleModels.map((model) => <label key={model.id}><input type="checkbox" checked={activeModelIds.includes(model.id)} onChange={() => toggleModel(model.id)} /><ModelMark model={model} small /><span>{model.name}</span></label>)}</div><div className="model-popover-actions"><button type="button" onClick={() => setActiveModelIds([])}>Clear</button><button type="button" onClick={() => setActiveModelIds(models.map((model) => model.id))}>Select all</button><button type="button" onClick={() => setActiveModelIds(models.map((model) => model.id))}>Reset to default</button><button type="button" onClick={saveModels}>Save</button><button type="button" onClick={loadModels}>Load</button></div></div></details></div></section>
    <section className="tier-canvas">{grouped.map(({ tier, models: inTier }) => <div className="tier-row" key={tier}><div className="tier-label" style={{ background: tierMeta[tier].color }}><strong>{tier}</strong></div><div className="tier-models">{inTier.length ? inTier.map((model) => <TierCard key={model.id} model={model} />) : <span className="empty-tier">No models landed here</span>}</div></div>)}</section>
    <section className="tier-footnote"><span><RollingNumber value={people} spinKey={peopleSpinKey} /> people ranked those models</span></section>
    <section className="benchmark-section"><div className="benchmark-heading"><div><h2>Compare every board</h2><p>The main tier list is above. Scroll down to compare the same models across each benchmark.</p></div><span className="benchmark-heading-note">{activeModelIds.length} models · {categories.length} boards</span></div><div className="benchmark-grid">{categories.map((item) => <BenchmarkPanel key={item.slug} item={item} activeModelIds={activeModelIds} selected={item.slug === category} onSelect={() => setCategory(item.slug)} />)}</div></section>
    <section className="page-cta"><div><h2>Ready to rank the models you actually use?</h2><p>Build a personal tier list, save your point of view, and share it with the community.</p></div><Link className="button" href="/rank">Make your own tier list <span>↗</span></Link></section>
  </main><Footer /></>;
}
