"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { categories, Model, models, Tier, tierMeta } from "../data";
import { Header, ModelMark } from "../components";

type Placements = Record<string, Tier | null>;
const tiers = Object.keys(tierMeta) as Tier[];
const storageKey = (category: string) => `tier-bench:ballot:${category}`;
const newestModel = [...models].sort((a, b) => new Date(b.release).getTime() - new Date(a.release).getTime())[0];

function RankCard({ model, onDragStart, onDragEnd, onCycle }: { model: Model; onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void; onDragEnd: () => void; onCycle: () => void }) {
  return <button className="model-pill compact rank-card" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onCycle} title="Drag to a tier, or tap to move to the next tier">
    <ModelMark model={model} small />
    <span className="model-copy"><strong>{model.name}</strong></span>
    <span className="drag-grip">⠿</span>
  </button>;
}

export default function RankPage() {
  const [category, setCategory] = useState("overall");
  const [placements, setPlacements] = useState<Placements>({});
  const [over, setOver] = useState<Tier | "unranked" | null>(null);
  const [notice, setNotice] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const draggedModel = useRef<string | null>(null);
  const rankedCount = Object.values(placements).filter(Boolean).length;

  useEffect(() => {
    const requestedCategory = new URLSearchParams(window.location.search).get("category");
    if (requestedCategory && categories.some((item) => item.slug === requestedCategory)) setCategory(requestedCategory);
    const saved = localStorage.getItem(storageKey(category));
    setPlacements(saved ? JSON.parse(saved) : {});
    fetch(`/api/rankings?category=${category}`).then((response) => response.ok ? response.json() : null).then((data) => {
      if (data?.placements) {
        setPlacements(data.placements);
        localStorage.setItem(storageKey(category), JSON.stringify(data.placements));
        setSubmitted(true);
      } else setSubmitted(false);
    }).catch(() => setSubmitted(false));
    setNotice("");
  }, [category]);

  const byTier = useMemo(() => {
    const result: Record<Tier | "unranked", Model[]> = { S: [], A: [], B: [], C: [], D: [], F: [], unranked: [] };
    models.forEach((model) => result[placements[model.id] ?? "unranked"].push(model));
    return result;
  }, [placements]);

  function place(modelId: string, tier: Tier | null) {
    setPlacements((current) => {
      const next = { ...current, [modelId]: tier };
      localStorage.setItem(storageKey(category), JSON.stringify(next));
      return next;
    });
  }

  function rankNewest() {
    place(newestModel.id, "S");
    setNotice(`${newestModel.name} was added to S tier. Move it whenever you have a better read.`);
    document.getElementById("personal-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submitRanking() {
    const response = await fetch("/api/rankings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, placements }) });
    if (response.ok) { setSubmitted(true); setNotice("Your personal tier list is saved to your account."); }
    else setNotice("We could not save your tier list. Please try again.");
  }

  function startDrag(modelId: string, event: React.DragEvent<HTMLButtonElement>) {
    draggedModel.current = modelId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", modelId);
  }

  function finishDrag() {
    draggedModel.current = null;
    setOver(null);
  }

  function drop(tier: Tier | null, event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const modelId = event.dataTransfer.getData("text/plain") || draggedModel.current;
    if (modelId && models.some((model) => model.id === modelId)) place(modelId, tier);
    finishDrag();
  }

  function cycle(modelId: string) {
    const current = placements[modelId];
    const next = current ? tiers[tiers.indexOf(current) + 1] ?? null : "S";
    place(modelId, next);
  }

  function reset() {
    setPlacements({});
    localStorage.removeItem(storageKey(category));
    setNotice("This local ballot has been reset.");
  }

  function createShare() {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const snapshot = { id, category, placements, createdAt: new Date().toISOString() };
    localStorage.setItem(`tier-bench:snapshot:${id}`, JSON.stringify(snapshot));
    const url = `${location.origin}/share/${id}`;
    navigator.clipboard?.writeText(url);
    setNotice(`Snapshot link copied: ${url}`);
    setShareOpen(false);
  }

  function savePicture() {
    const width = 1200, height = 630, rowH = 80, left = 90;
    const esc = (value: string) => value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]!));
    let rows = "";
    tiers.forEach((tier, rowIndex) => {
      const y = 92 + rowIndex * rowH;
      rows += `<rect x="30" y="${y}" width="${left}" height="${rowH - 2}" fill="${tierMeta[tier].color}"/><text x="${30 + left / 2}" y="${y + 52}" text-anchor="middle" font-size="32" font-weight="800" fill="#090909">${tier}</text>`;
      byTier[tier].forEach((model, index) => {
        const x = 135 + (index % 4) * 250, cardY = y + 12 + Math.floor(index / 4) * 32;
        rows += `<rect x="${x}" y="${cardY}" width="232" height="52" rx="6" fill="#181818" stroke="#393936"/><circle cx="${x + 28}" cy="${cardY + 26}" r="17" fill="${model.color}"/><text x="${x + 55}" y="${cardY + 32}" font-size="17" font-weight="700" fill="#f5f3ed">${esc(model.name)}</text>`;
      });
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#090909"/><text x="30" y="54" font-family="Arial" font-size="30" font-weight="800" fill="#f5f3ed">tier/bench · ${esc(categories.find(c => c.slug === category)!.name)}</text><text x="1170" y="52" text-anchor="end" font-family="monospace" font-size="12" fill="#d8ff55">MY COMMUNITY BALLOT</text><g font-family="Arial">${rows}</g></svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `tier-bench-${category}.svg`; anchor.click(); URL.revokeObjectURL(anchor.href);
    setShareOpen(false);
  }

  return <><Header /><main className="page-shell rank-layout">
    <aside className="rank-sidebar">
      <span className="section-index">Your ballot</span><h2>Rank what you know.</h2><p>Leave unfamiliar models on the bench. Tap a card to cycle tiers, or drag it exactly where it belongs.</p>
      {!placements[newestModel.id] && <div className="new-model-prompt"><span className="section-index">New on the board</span><strong>{newestModel.name}</strong><small>{newestModel.release} · {newestModel.description}</small><button className="button acid" onClick={rankNewest}>Propose a rank <span>↗</span></button></div>}
      <label htmlFor="category">Board</label><select id="category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select>
      <div className="progress-track"><span style={{ width: `${Math.min(100, rankedCount / 5 * 100)}%` }} /></div><div className="progress-copy"><span>{rankedCount} ranked</span><span>{rankedCount > 0 ? "ready to submit" : "1 to submit"}</span></div>
      <div className="rank-actions">{rankedCount > 0 && <button className="button acid" onClick={submitRanking}>{submitted ? "Update saved list" : "Save tier list"} <span>↗</span></button>}<button className="button" disabled={rankedCount < 5} onClick={() => setShareOpen(true)}>Share <span>↗</span></button></div>
    </aside>
    <section className="rank-workspace" id="personal-editor">
      {notice && <div className="notice">{notice}</div>}
      <div className="rank-help"><span>Drag models between tiers. Within-tier order is kept for your personal view.</span><button onClick={reset}>Reset ballot</button></div>
      <div className="editor-board">{tiers.map((tier) => <div className={`editor-row ${over === tier ? "drag-over" : ""}`} data-drop-tier={tier} key={tier} onDragEnter={(event) => { event.preventDefault(); setOver(tier); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOver(tier); }} onDrop={(event) => drop(tier, event)}>
        <div className="editor-label" style={{ background: tierMeta[tier].color }}>{tier}</div>
        <div className="editor-dropzone">
          {byTier[tier].map((model) => <RankCard key={model.id} model={model} onDragStart={(event) => startDrag(model.id, event)} onDragEnd={finishDrag} onCycle={() => cycle(model.id)} />)}
        </div>
      </div>)}</div>
      <div className={`unranked ${over === "unranked" ? "drag-over" : ""}`} data-drop-tier="unranked" onDragEnter={(event) => { event.preventDefault(); setOver("unranked"); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOver("unranked"); }} onDrop={(event) => drop(null, event)}><h3>On the bench · unranked</h3><div className="unranked-list">{byTier.unranked.map((model) => <RankCard key={model.id} model={model} onDragStart={(event) => startDrag(model.id, event)} onDragEnd={finishDrag} onCycle={() => cycle(model.id)} />)}</div></div>
      <section className="criteria-suggestions"><span className="section-index">Keep going</span><h2>Rank the same models by another lens.</h2><p>Your personal opinion changes with the job. Start another private board for a criterion that matters to you.</p><div className="criteria-suggestion-grid">{categories.filter((item) => item.slug !== category).slice(0, 3).map((item) => <Link href={`/rank?category=${item.slug}`} className="criteria-suggestion" key={item.slug}><strong>{item.name}</strong><span>{item.short}</span><small>{item.prompt}</small><b>Start board ↗</b></Link>)}</div><Link className="text-link" href="/proposals">Suggest a new criterion ↗</Link></section>
    </section>
  </main>
  {shareOpen && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><button className="modal-close" onClick={() => setShareOpen(false)}>×</button><span className="section-index">Share this revision</span><h2>Make it permanent.</h2><p>Each share is an immutable local snapshot. Future ballot edits won’t change it.</p><div className="modal-options"><button onClick={createShare}><strong>Copy a link</strong><small>Create a local snapshot URL and copy it.</small></button><button onClick={savePicture}><strong>Save a picture</strong><small>Download a 1200 × 630 vector image.</small></button></div></div></div>}
  </>;
}
