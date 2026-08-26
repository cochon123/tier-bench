"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth, useClerk } from "@clerk/nextjs";
import { categories, Model, models, Tier, tierMeta } from "../data";
import { Header, ModelMark } from "../components";
import type { CatalogApiModel } from "../lib/model-catalog";
import { Turnstile, turnstileEnabled } from "../turnstile";
import { useModelCatalog } from "../use-model-catalog";
import { clearPendingBallotSave, PendingBallotSave, readPendingBallotSave, storePendingBallotSave } from "./pending-save";

type Placements = Record<string, Tier | null>;
type DropPreview = { tier: Tier | null; targetModelId?: string; afterTarget: boolean };
const tiers = Object.keys(tierMeta) as Tier[];
const storageKey = (category: string) => `tier-bench:ballot:${category}`;
const orderStorageKey = (category: string) => `tier-bench:ballot-order:${category}`;
const newestModel = [...models].sort((a, b) => new Date(b.release).getTime() - new Date(a.release).getTime())[0];

function RankCard({ model, dragging, onDragStart, onDragEnd, onTouchStart, onTouchMove, onTouchEnd, onCycle }: { model: Model; dragging: boolean; onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void; onDragEnd: () => void; onTouchStart: (event: React.PointerEvent<HTMLButtonElement>) => void; onTouchMove: (event: React.PointerEvent<HTMLButtonElement>) => void; onTouchEnd: (event: React.PointerEvent<HTMLButtonElement>) => void; onCycle: () => void }) {
  return <button className={`tier-card rank-card ${dragging ? "is-dragging" : ""}`} data-model-id={model.id} draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onPointerDown={onTouchStart} onPointerMove={onTouchMove} onPointerUp={onTouchEnd} onPointerCancel={onDragEnd} onClick={onCycle} title="Drag to a tier or between two models to reorder; tap to cycle tiers">
    <ModelMark model={model} small />
    <span className="model-copy"><strong>{model.name}</strong></span>
  </button>;
}

function RankPlaceholder({ model }: { model: Model }) {
  return <div className="tier-card rank-card drag-placeholder" aria-hidden="true">
    <ModelMark model={model} small />
    <span className="model-copy"><strong>{model.name}</strong></span>
  </div>;
}

export default function RankPage() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const [category, setCategory] = useState("overall");
  const [placements, setPlacements] = useState<Placements>({});
  const [modelOrder, setModelOrder] = useState<string[]>([]);
  const [over, setOver] = useState<Tier | "unranked" | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const [notice, setNotice] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [mounted, setMounted] = useState(false);
  const [boardLoading, setBoardLoading] = useState(true);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [pendingModelIds, setPendingModelIds] = useState<string[]>([]);
  const [pinnedModels, setPinnedModels] = useState<CatalogApiModel[]>([]);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileGeneration, setTurnstileGeneration] = useState(0);
  const [pendingSave, setPendingSave] = useState<PendingBallotSave | null>(null);
  const [saving, setSaving] = useState(false);
  const [phoneLayout, setPhoneLayout] = useState(false);
  const draggedModel = useRef<string | null>(null);
  const touchDrag = useRef<{ modelId: string; moved: boolean } | null>(null);
  const suppressNextClick = useRef(false);
  const freshCategory = useRef<string | null>(null);
  const automaticSaveStarted = useRef(false);
  const saveInFlight = useRef(false);
  const { availableModels, catalogLoading } = useModelCatalog(pinnedModels);
  const retiredModelIds = useMemo(() => new Set(pinnedModels.filter((model) => model.status !== "active").map((model) => model.id)), [pinnedModels]);
  const rankedCount = Object.values(placements).filter(Boolean).length;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 850px)");
    const updateLayout = () => setPhoneLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  const starterModelIds = useMemo(() => new Set([...availableModels]
    .sort((left, right) => {
      const leftDate = new Date(left.release).getTime();
      const rightDate = new Date(right.release).getTime();
      return (Number.isNaN(rightDate) ? 0 : rightDate) - (Number.isNaN(leftDate) ? 0 : leftDate);
    })
    .slice(0, phoneLayout ? 10 : 20)
    .map((model) => model.id)), [availableModels, phoneLayout]);

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const requestedCategory = params.get("category");
    const targetCategory = requestedCategory && categories.some((item) => item.slug === requestedCategory) ? requestedCategory : "overall";
    if (requestedCategory && categories.some((item) => item.slug === requestedCategory)) setCategory(requestedCategory);
    if (params.get("publish") === "pending") {
      const pending = readPendingBallotSave(sessionStorage);
      if (pending && categories.some((item) => item.slug === pending.category)) {
        setPendingSave(pending);
        setCategory(pending.category);
        setPlacements(pending.placements);
        setSubmitted(false);
        localStorage.setItem(storageKey(pending.category), JSON.stringify(pending.placements));
        setNotice("Sign-in complete. Publishing your tier list…");
      } else {
        clearPendingBallotSave(sessionStorage);
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("publish");
        history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      }
    }
    if (params.get("fresh") === "1") {
      freshCategory.current = targetCategory;
      localStorage.removeItem(storageKey(targetCategory));
      setPlacements({});
      setSubmitted(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (freshCategory.current === category) {
      freshCategory.current = null;
      localStorage.removeItem(storageKey(category));
      localStorage.removeItem(orderStorageKey(category));
      setPlacements({});
      setModelOrder([]);
      setSubmitted(false);
      setNotice("");
      setBoardLoading(false);
      return () => controller.abort();
    }
    setBoardLoading(true);
    const local = localStorage.getItem(storageKey(category));
    const localOrder = localStorage.getItem(orderStorageKey(category));
    let localDraft: Placements = {};
    try { localDraft = local ? JSON.parse(local) as Placements : {}; } catch { localStorage.removeItem(storageKey(category)); }
    try {
      const parsedOrder = localOrder ? JSON.parse(localOrder) as unknown : [];
      setModelOrder(Array.isArray(parsedOrder) ? parsedOrder.filter((id): id is string => typeof id === "string") : []);
    } catch {
      localStorage.removeItem(orderStorageKey(category));
      setModelOrder([]);
    }
    const hasLocalDraft = Object.keys(localDraft).length > 0;
    setPlacements(localDraft);
    setSubmitted(false);
    setNotice("");
    fetch(`/api/rankings?category=${encodeURIComponent(category)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { placements: Placements | null; models?: CatalogApiModel[] };
        setPinnedModels(Array.isArray(data.models) ? data.models : []);
        // A browser draft may predate sign-in. Never replace the work the user
        // can currently see with an older server revision behind their back.
        if (hasLocalDraft) return;
        const saved = data.placements ?? {};
        setPlacements(saved);
        setSubmitted(data.placements !== null);
        localStorage.setItem(storageKey(category), JSON.stringify(saved));
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setBoardLoading(false); });
    return () => controller.abort();
  }, [category]);

  const byTier = useMemo(() => {
    const result: Record<Tier | "unranked", Model[]> = { S: [], A: [], B: [], C: [], D: [], F: [], unranked: [] };
    const orderIndex = new Map(modelOrder.map((id, index) => [id, index]));
    availableModels
      .filter((model) => starterModelIds.has(model.id) || model.id in placements)
      .sort((left, right) => (orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER))
      .forEach((model) => result[placements[model.id] ?? "unranked"].push(model));
    return result;
  }, [availableModels, modelOrder, placements, starterModelIds]);

  function place(modelId: string, tier: Tier | null) {
    setSubmitted(false);
    setPlacements((current) => {
      const next = { ...current, [modelId]: tier };
      localStorage.setItem(storageKey(category), JSON.stringify(next));
      return next;
    });
  }

  function placeAndOrder(modelId: string, tier: Tier | null, targetModelId?: string, afterTarget = false) {
    place(modelId, tier);
    setModelOrder((current) => {
      const completeOrder = [...current, ...availableModels.map((model) => model.id).filter((id) => !current.includes(id))];
      const next = completeOrder.filter((id) => id !== modelId);
      const targetIndex = targetModelId ? next.indexOf(targetModelId) : -1;
      next.splice(targetIndex < 0 ? next.length : targetIndex + (afterTarget ? 1 : 0), 0, modelId);
      localStorage.setItem(orderStorageKey(category), JSON.stringify(next));
      return next;
    });
  }

  function rankNewest() {
    place(newestModel.id, "S");
    setNotice(`${newestModel.name} was added to S tier. Move it whenever you have a better read.`);
    document.getElementById("personal-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submitRanking(targetCategory = category, targetPlacements = placements): Promise<boolean> {
    if (saveInFlight.current) return false;
    saveInFlight.current = true;
    setSaving(true);
    try {
      const response = await fetch("/api/rankings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: targetCategory, placements: targetPlacements, turnstileToken }) });
      const data = await response.json().catch(() => null) as { placements?: Placements; error?: string } | null;
      if (response.ok) {
        const saved = data?.placements ?? targetPlacements;
        localStorage.setItem(storageKey(targetCategory), JSON.stringify(saved));
        if (targetCategory === category) { setPlacements(saved); setSubmitted(true); }
        setNotice("Saved. Your ballot now contributes to this category’s global score.");
        return true;
      } else {
        setNotice(data?.error || `We could not save your tier list (error ${response.status}). Please try again.`);
        return false;
      }
    } catch {
      setNotice("We could not reach the save service. Check your connection and try again.");
      return false;
    } finally {
      saveInFlight.current = false;
      setSaving(false);
      setTurnstileToken(null);
      setTurnstileGeneration((current) => current + 1);
    }
  }

  function finishPendingSave() {
    clearPendingBallotSave(sessionStorage);
    setPendingSave(null);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("publish");
    history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }

  function requestSave() {
    if (!authLoaded || saving) return;
    if (isSignedIn) {
      void submitRanking().then((saved) => { if (saved && pendingSave) finishPendingSave(); });
      return;
    }
    const pending = { category, placements, requestedAt: Date.now() };
    storePendingBallotSave(sessionStorage, pending);
    setPendingSave(pending);
    const returnUrl = `/rank?category=${encodeURIComponent(category)}&publish=pending`;
    clerk.openSignIn({ forceRedirectUrl: returnUrl, signUpForceRedirectUrl: returnUrl });
  }

  useEffect(() => {
    if (!pendingSave || automaticSaveStarted.current || !authLoaded || !isSignedIn || boardLoading || (turnstileEnabled && !turnstileToken)) return;
    automaticSaveStarted.current = true;
    void submitRanking(pendingSave.category, pendingSave.placements).then((saved) => { if (saved) finishPendingSave(); });
  }, [authLoaded, boardLoading, isSignedIn, pendingSave, turnstileToken]);

  function startDrag(modelId: string, event: React.DragEvent<HTMLButtonElement>) {
    draggedModel.current = modelId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", modelId);
  }

  function finishDrag() {
    draggedModel.current = null;
    touchDrag.current = null;
    setOver(null);
    setDropPreview(null);
  }

  function insertionAtPoint(container: HTMLElement, clientX: number, clientY: number): Pick<DropPreview, "targetModelId" | "afterTarget"> {
    const cards = [...container.querySelectorAll<HTMLElement>("[data-model-id]")]
      .filter((card) => card.dataset.modelId !== draggedModel.current)
      .map((card) => ({ card, rect: card.getBoundingClientRect() }));
    if (cards.length === 0) return { afterTarget: false };

    const rows: Array<typeof cards> = [];
    for (const card of cards) {
      const row = rows.find((items) => Math.abs(items[0].rect.top - card.rect.top) < 4);
      if (row) row.push(card); else rows.push([card]);
    }
    const row = rows.reduce((closest, candidate) => {
      const candidateCenter = candidate[0].rect.top + candidate[0].rect.height / 2;
      const closestCenter = closest[0].rect.top + closest[0].rect.height / 2;
      return Math.abs(clientY - candidateCenter) < Math.abs(clientY - closestCenter) ? candidate : closest;
    });
    row.sort((left, right) => left.rect.left - right.rect.left);
    const before = row.find(({ rect }) => clientX < rect.left + rect.width / 2);
    if (before) return { targetModelId: before.card.dataset.modelId, afterTarget: false };
    const last = row[row.length - 1];
    return { targetModelId: last.card.dataset.modelId, afterTarget: true };
  }

  function previewForContainer(tier: Tier | null, container: HTMLElement, clientX: number, clientY: number): DropPreview {
    return { tier, ...insertionAtPoint(container, clientX, clientY) };
  }

  function showDropPreview(preview: DropPreview) {
    setDropPreview((current) => current?.tier === preview.tier && current.targetModelId === preview.targetModelId && current.afterTarget === preview.afterTarget ? current : preview);
    setOver(preview.tier ?? "unranked");
  }

  function dropTargetAtPoint(clientX: number, clientY: number): DropPreview | undefined {
    const element = document.elementFromPoint(clientX, clientY);
    const target = element?.closest<HTMLElement>("[data-drop-tier]");
    const dropTier = target?.dataset.dropTier;
    const tier = dropTier === "unranked" ? null : dropTier && tiers.includes(dropTier as Tier) ? dropTier as Tier : undefined;
    if (tier === undefined) return undefined;
    const container = target?.querySelector<HTMLElement>(dropTier === "unranked" ? ".unranked-list" : ".editor-dropzone");
    return container ? previewForContainer(tier, container, clientX, clientY) : { tier, afterTarget: false };
  }

  function startTouchDrag(modelId: string, event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== "touch") return;
    touchDrag.current = { modelId, moved: false };
    draggedModel.current = modelId;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveTouchDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = touchDrag.current;
    if (!drag) return;
    if (!drag.moved) {
      const distance = Math.hypot(event.clientX - event.currentTarget.getBoundingClientRect().left - event.currentTarget.clientWidth / 2, event.clientY - event.currentTarget.getBoundingClientRect().top - event.currentTarget.clientHeight / 2);
      if (distance < 8) return;
      drag.moved = true;
    }
    event.preventDefault();
    const target = dropTargetAtPoint(event.clientX, event.clientY);
    if (target) showDropPreview(target);
  }

  function endTouchDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = touchDrag.current;
    if (!drag) return;
    if (drag.moved) {
      event.preventDefault();
      suppressNextClick.current = true;
      const target = dropTargetAtPoint(event.clientX, event.clientY);
      if (target) {
        placeAndOrder(drag.modelId, target.tier, target.targetModelId, target.afterTarget);
      }
    }
    finishDrag();
  }

  function cycleFromCard(modelId: string) {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    cycle(modelId);
  }

  function drop(tier: Tier | null, event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const modelId = event.dataTransfer.getData("text/plain") || draggedModel.current;
    const container = event.currentTarget.querySelector<HTMLElement>(tier === null ? ".unranked-list" : ".editor-dropzone");
    const target = container ? previewForContainer(tier, container, event.clientX, event.clientY) : { tier, afterTarget: false };
    if (modelId && availableModels.some((model) => model.id === modelId)) placeAndOrder(modelId, tier, target.targetModelId, target.afterTarget);
    finishDrag();
  }

  function cycle(modelId: string) {
    const current = placements[modelId];
    const next = current ? tiers[tiers.indexOf(current) + 1] ?? null : "S";
    place(modelId, next);
  }

  function reset() {
    setPlacements({});
    setModelOrder([]);
    setSubmitted(false);
    localStorage.removeItem(storageKey(category));
    localStorage.removeItem(orderStorageKey(category));
    setNotice("This local ballot has been reset.");
  }

  function openModelPicker() {
    setPendingModelIds([]);
    setModelSearch("");
    setModelPickerOpen(true);
  }

  function addSelectedModels() {
    setPlacements((current) => {
      const next = { ...current };
      pendingModelIds.forEach((id) => { next[id] = null; });
      localStorage.setItem(storageKey(category), JSON.stringify(next));
      return next;
    });
    setSubmitted(false);
    setModelPickerOpen(false);
  }

  async function createShare() {
    const response = await fetch("/api/shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, turnstileToken }) });
    setTurnstileToken(null);
    setTurnstileGeneration((current) => current + 1);
    if (!response.ok) { setNotice(response.status === 401 ? "Log in to create a share link." : response.status === 409 ? "Save this draft before sharing it." : "We could not create a share link."); return; }
    const data = await response.json(); const url = `${location.origin}/share/${data.snapshot.id}`;
    navigator.clipboard?.writeText(url); setNotice(`Snapshot link copied: ${url}`); setShareOpen(false);
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

  function renderRankCards(modelsInTier: Model[], tier: Tier | null) {
    const preview = dropPreview?.tier === tier ? dropPreview : null;
    const dragged = draggedModel.current ? availableModels.find((model) => model.id === draggedModel.current) : undefined;
    const placeholder = dragged ? <RankPlaceholder key={`placeholder-${tier ?? "unranked"}`} model={dragged} /> : null;
    const cards = [];
    for (const model of modelsInTier) {
      if (preview?.targetModelId === model.id && !preview.afterTarget && placeholder) cards.push(placeholder);
      cards.push(<RankCard key={model.id} model={model} dragging={draggedModel.current === model.id} onDragStart={(event) => startDrag(model.id, event)} onDragEnd={finishDrag} onTouchStart={(event) => startTouchDrag(model.id, event)} onTouchMove={moveTouchDrag} onTouchEnd={endTouchDrag} onCycle={() => cycleFromCard(model.id)} />);
      if (preview?.targetModelId === model.id && preview.afterTarget && placeholder) cards.push(placeholder);
    }
    if (preview && !preview.targetModelId && placeholder) cards.push(placeholder);
    return cards;
  }

  return <><Header /><main className="page-shell rank-layout">
    <aside className="rank-sidebar">
      <span className="section-index">Your ballot</span><h2>Rank what you know.</h2><p>Leave unfamiliar models on the bench. Tap a card to cycle tiers, or drag it exactly where it belongs.</p>
      {!placements[newestModel.id] && <div className="new-model-prompt"><span className="section-index">New on the board</span><strong>{newestModel.name}</strong><small>{newestModel.release} · {newestModel.description}</small><button className="button acid" onClick={rankNewest}>Propose a rank <span>↗</span></button></div>}
      <label htmlFor="category">Board</label><select id="category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select>
      <div className="progress-track"><span style={{ width: `${Math.min(100, rankedCount / 5 * 100)}%` }} /></div><div className="progress-copy"><span>{rankedCount} ranked</span><span>{rankedCount >= 5 ? "ready to submit" : `${5 - rankedCount} to submit`}</span></div>
      <Turnstile key={turnstileGeneration} onToken={setTurnstileToken} />
      <div className="rank-actions">{rankedCount > 0 && <button className="button acid" disabled={!authLoaded || saving || boardLoading || rankedCount < 5 || (Boolean(isSignedIn) && turnstileEnabled && !turnstileToken)} onClick={requestSave}>{saving ? "Saving…" : submitted ? "Update saved list" : "Save tier list"} <span>↗</span></button>}<button className="button" title={!submitted ? "Save this draft before sharing" : undefined} disabled={!mounted || saving || boardLoading || rankedCount < 5 || !submitted || (turnstileEnabled && !turnstileToken)} onClick={() => setShareOpen(true)}>{submitted ? "Share" : "Save before sharing"} <span>↗</span></button></div>
    </aside>
    <section className="rank-workspace" id="personal-editor">
      {boardLoading && <div className="notice">Loading your saved {categories.find((item) => item.slug === category)?.name} board…</div>}
      {!boardLoading && notice && <div className="notice">{notice}</div>}
      <div className="rank-help"><span>Drag models between tiers. Within-tier order is kept for your personal view.</span><button onClick={reset}>Reset ballot</button></div>
      <div className="editor-board">{tiers.map((tier) => <div className={`editor-row ${over === tier ? "drag-over" : ""}`} data-drop-tier={tier} key={tier} onDragEnter={(event) => { event.preventDefault(); setOver(tier); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; const container = event.currentTarget.querySelector<HTMLElement>(".editor-dropzone"); if (container) showDropPreview(previewForContainer(tier, container, event.clientX, event.clientY)); }} onDrop={(event) => drop(tier, event)}>
        <div className="editor-label" style={{ background: tierMeta[tier].color }}>{tier}</div>
        <div className="editor-dropzone">
          {renderRankCards(byTier[tier], tier)}
        </div>
      </div>)}</div>
      <div className={`unranked ${over === "unranked" ? "drag-over" : ""}`} data-drop-tier="unranked" onDragEnter={(event) => { event.preventDefault(); setOver("unranked"); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; const container = event.currentTarget.querySelector<HTMLElement>(".unranked-list"); if (container) showDropPreview(previewForContainer(null, container, event.clientX, event.clientY)); }} onDrop={(event) => drop(null, event)}><div className="bench-heading"><h3>On the bench · unranked</h3><span>{byTier.unranked.length} models · scroll to explore</span></div><div className="unranked-list">{renderRankCards(byTier.unranked, null)}<button type="button" className="add-model-card" onClick={openModelPicker} aria-label="Add a model to this board">+</button></div></div>
      <section className="criteria-suggestions"><span className="section-index">Keep going</span><h2>Rank the same models by another lens.</h2><p>Your personal opinion changes with the job. Open another private board for a criterion that matters to you.</p><input className="criteria-search" value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Search all categories..." aria-label="Search all categories" /><div className="criteria-suggestion-grid">{categories.filter((item) => item.slug !== category && `${item.name} ${item.short} ${item.prompt}`.toLowerCase().includes(categorySearch.toLowerCase())).map((item) => <button type="button" onClick={() => { setCategory(item.slug); history.replaceState(null, "", `/rank?category=${item.slug}`); document.querySelector(".rank-sidebar")?.scrollIntoView({ behavior: "smooth" }); }} className="criteria-suggestion" key={item.slug}><strong>{item.name}</strong><span>{item.short}</span><small>{item.prompt}</small><b>Open board ↗</b></button>)}</div><Link className="text-link" href="/proposals">Suggest a new criterion ↗</Link></section>
    </section>
  </main>
  {shareOpen && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><button className="modal-close" onClick={() => setShareOpen(false)}>×</button><span className="section-index">Share this revision</span><h2>Make it permanent.</h2><p>Each share is an immutable database snapshot. Future ballot edits won’t change it.</p><div className="modal-options"><button onClick={createShare}><strong>Copy a link</strong><small>Create a durable snapshot URL and copy it.</small></button><button onClick={savePicture}><strong>Save a picture</strong><small>Download a 1200 × 630 vector image.</small></button></div></div></div>}
  {modelPickerOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-model-title"><div className="modal model-picker"><button className="modal-close" onClick={() => setModelPickerOpen(false)}>×</button><span className="section-index">Add models</span><h2 id="add-model-title">Choose what belongs on the bench.</h2><input autoFocus value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="Search models…" aria-label="Search models" /><div className="model-picker-list">{availableModels.filter((model) => !retiredModelIds.has(model.id) && !(starterModelIds.has(model.id) || model.id in placements) && `${model.name} ${model.maker} ${model.id}`.toLowerCase().includes(modelSearch.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)).map((model) => <label key={model.id}><input type="checkbox" checked={pendingModelIds.includes(model.id)} onChange={() => setPendingModelIds((current) => current.includes(model.id) ? current.filter((id) => id !== model.id) : [...current, model.id])} /><ModelMark model={model} small /><span>{model.name}</span></label>)}{catalogLoading && <p>Loading the OpenRouter catalog…</p>}{!catalogLoading && availableModels.every((model) => retiredModelIds.has(model.id) || starterModelIds.has(model.id) || model.id in placements) && <p>Every available model is already on this board.</p>}</div><button className="button acid" disabled={pendingModelIds.length === 0} onClick={addSelectedModels}>Done <span>↗</span></button></div></div>}
  </>;
}
