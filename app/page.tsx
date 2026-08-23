"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { categories, leaderboard, models, Tier, tierMeta } from "./data";
import { Footer, Header, ModelMark } from "./components";

function TierCard({ model, rank }: { model: ReturnType<typeof leaderboard>[number]; rank: number }) {
  return <Link href={`/models/${model.id}`} className="tier-card"><span className="tier-rank">{String(rank).padStart(2, "0")}</span><ModelMark model={model} small /><strong>{model.name}</strong><span className="tier-grip">⠿</span></Link>;
}

function BenchmarkPanel({ item, activeModelIds, selected, onSelect }: { item: (typeof categories)[number]; activeModelIds: string[]; selected: boolean; onSelect: () => void }) {
  const results = leaderboard(item.slug).filter((model) => activeModelIds.includes(model.id));
  const tiers = (Object.keys(tierMeta) as Tier[]).map((tier) => ({ tier, models: results.filter((model) => model.tier === tier) }));
  return <button type="button" className={`benchmark-panel ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onSelect}>
    <header className="benchmark-panel-head"><div><strong>{item.name}</strong><span>{item.short}</span></div><b>Tier board</b></header>
    <div className="benchmark-tier-list">{tiers.map(({ tier, models: inTier }) => <div className="benchmark-tier-row" key={tier}><strong className="benchmark-tier-label" style={{ background: tierMeta[tier].color }}>{tier}</strong><div className="benchmark-tier-models">{inTier.length ? inTier.map((model) => <span className="benchmark-model-chip" key={model.id}><ModelMark model={model} small /><b>{model.name}</b></span>) : <span className="benchmark-empty">—</span>}</div></div>)}</div>
    <footer>Click to focus this benchmark <span>↗</span></footer>
  </button>;
}

export default function Home() {
  const [category, setCategory] = useState("overall");
  const [activeModelIds, setActiveModelIds] = useState<string[]>(() => models.map((model) => model.id));
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => { const saved = localStorage.getItem("tier-bench:active-models"); if (saved) setActiveModelIds(JSON.parse(saved)); }, []);
  const board = useMemo(() => leaderboard(category).filter((model) => activeModelIds.includes(model.id)), [category, activeModelIds]);
  const grouped = (Object.keys(tierMeta) as Tier[]).map((tier) => ({ tier, models: board.filter((model) => model.tier === tier) }));
  const active = categories.find((item) => item.slug === category)!;
  const visibleModels = models.filter((model) => model.name.toLowerCase().includes(search.toLowerCase()));

  function reset() { setCategory("overall"); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function exportBoard() {
    const esc = (value: string) => value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]!));
    const rows = grouped.map(({ tier, models: inTier }, row) => `<rect x="30" y="${108 + row * 75}" width="115" height="73" fill="${tierMeta[tier].color}"/><text x="87" y="${153 + row * 75}" text-anchor="middle" font-size="32" font-weight="800" fill="#090909">${tier}</text>${inTier.map((model) => `<rect x="165" y="${119 + row * 75}" width="230" height="51" rx="6" fill="#171717" stroke="#3a3a37"/><text x="180" y="${151 + row * 75}" font-size="16" font-family="Arial" fill="#f5f3ed">${esc(model.name)}</text>`).join("")}`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="650"><rect width="100%" height="100%" fill="#090909"/><text x="30" y="60" font-size="32" font-family="Arial" font-weight="800" fill="#f5f3ed">AI model tier list</text><text x="403" y="59" font-size="18" font-family="Arial" fill="#777">${models.length} models · ${esc(active.name)}</text>${rows}</svg>`;
    const sourceUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const image = new Image();
    image.onload = () => { const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 650; canvas.getContext("2d")!.drawImage(image, 0, 0); const link = document.createElement("a"); link.href = canvas.toDataURL("image/png"); link.download = `tier-list-${category}.png`; link.click(); URL.revokeObjectURL(sourceUrl); };
    image.src = sourceUrl;
  }

  function toggleModel(id: string) { setActiveModelIds((current) => current.includes(id) ? current.filter((modelId) => modelId !== id) : [...current, id]); }
  function saveModels() { localStorage.setItem("tier-bench:active-models", JSON.stringify(activeModelIds)); setSelectorOpen(false); }
  function loadModels() { const saved = localStorage.getItem("tier-bench:active-models"); if (saved) setActiveModelIds(JSON.parse(saved)); }

  return <><Header /><main className="tier-app">
    <section className="landing-hero">
      <div className="landing-hero-copy">
        <span className="eyebrow"><span>COMMUNITY AI RANKINGS</span><i /> BUILT FOR PEOPLE WHO USE THE MODELS</span>
        <h1>Find the models worth <em>keeping.</em></h1>
        <p>tier/bench is a living, community-built guide to the AI models people actually use. Compare the main board, explore focused benchmarks, and make a ranking that reflects your own work.</p>
        <div className="landing-actions"><Link className="button acid landing-primary" href="/rank">Make your own tier list <span>↗</span></Link><a className="text-link" href="#main-board">Explore the rankings ↓</a></div>
      </div>
    </section>
    <section className="tier-toolbar" id="main-board"><div className="tier-title"><h1>AI model tier list</h1></div><div className="toolbar-actions"><button className="toolbar-button" onClick={reset}>Reset</button><button className="toolbar-button export" onClick={exportBoard}>Export PNG <span>↗</span></button></div></section>
    <section className="tier-controls"><div className="tier-global-label">Global tier-list</div><div className="tier-control-selects"><details className="model-manager" open={selectorOpen} onToggle={(event) => setSelectorOpen(event.currentTarget.open)}><summary className="model-manager-trigger">{activeModelIds.length} selected <b>⌄</b></summary><div className="model-popover"><input autoFocus={selectorOpen} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search models..." /><div className="model-popover-list">{visibleModels.map((model) => <label key={model.id}><input type="checkbox" checked={activeModelIds.includes(model.id)} onChange={() => toggleModel(model.id)} /><ModelMark model={model} small /><span>{model.name}</span><i>●</i></label>)}</div><div className="model-popover-actions"><button type="button" onClick={() => setActiveModelIds([])}>Clear</button><button type="button" onClick={() => setActiveModelIds(models.map((model) => model.id))}>Select all</button><button type="button" onClick={() => setActiveModelIds(models.map((model) => model.id))}>Reset to default</button><button type="button" onClick={saveModels}>Save</button><button type="button" onClick={loadModels}>Load</button></div></div></details></div></section>
    <section className="tier-canvas">{grouped.map(({ tier, models: inTier }) => <div className="tier-row" key={tier}><div className="tier-label" style={{ background: tierMeta[tier].color }}><strong>{tier}</strong></div><div className="tier-models">{inTier.length ? inTier.map((model, index) => <TierCard key={model.id} model={model} rank={board.indexOf(model) + 1} />) : <span className="empty-tier">No models landed here</span>}</div><div className="tier-actions"><button type="button" aria-label={`Add model to ${tier}`}>＋</button><button type="button" aria-label={`Clear ${tier}`}>×</button></div></div>)}</section>
    <section className="tier-footnote"><span>Scores update by board</span><p>{active.prompt}</p><Link href="/methodology">How this is calculated ↗</Link></section>
    <section className="benchmark-section"><div className="benchmark-heading"><div><span className="section-index">02 / BENCHMARK TIER LISTS</span><h2>Compare every board</h2><p>The main tier list is above. Scroll down to compare the same models across each benchmark.</p></div><span className="benchmark-heading-note">{activeModelIds.length} models · {categories.length} boards</span></div><div className="benchmark-grid">{categories.map((item) => <BenchmarkPanel key={item.slug} item={item} activeModelIds={activeModelIds} selected={item.slug === category} onSelect={() => setCategory(item.slug)} />)}</div></section>
    <section className="page-cta"><div><span>MAKE YOUR CALL</span><h2>Ready to rank the models you actually use?</h2><p>Build a personal tier list, save your point of view, and share it with the community.</p></div><Link className="button" href="/rank">Make your own tier list <span>↗</span></Link></section>
  </main><Footer /></>;
}
