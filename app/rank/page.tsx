"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth, useClerk } from "@clerk/nextjs";
import { categories, Model, Tier, tierMeta } from "../data";
import { Header, ModelMark } from "../components";
import { newestCatalogModel } from "../lib/model-catalog";
import type { CatalogApiModel } from "../lib/model-catalog";
import { Turnstile, turnstileEnabled } from "../turnstile";
import { useModelCatalog } from "../use-model-catalog";
import { authoredBallotOrigin, ballotDraftOriginStorageKey, ballotOriginAfterUndo, countRankedPlacements, excludedModelStorageKey, hasAuthoredLocalBallot, omitExcludedPlacements, parseExcludedModelIds, restoreExcludedPlacements, serverBallotOrigin } from "./ballot-exclusions";
import { renderBallotPng } from "./ballot-image";
import { clearPendingBallotSave, PendingBallotSave, readPendingBallotSave, storePendingBallotSave } from "./pending-save";

type Placements = Record<string, Tier | null>;
type DropPreview = { tier: Tier | null; targetModelId?: string; afterTarget: boolean };
type DropDestination = DropPreview | { trash: true };
type RemovedModel = { id: string; name: string; hadPlacement: boolean; tier: Tier | null };
const tiers = Object.keys(tierMeta) as Tier[];
const storageKey = (category: string) => `tier-bench:ballot:${category}`;
const orderStorageKey = (category: string) => `tier-bench:ballot-order:${category}`;
function RankCard({ model, dragging, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onCycle, onRemove }: { model: Model; dragging: boolean; onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void; onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void; onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void; onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void; onCycle: () => void; onRemove: () => void }) {
  return <button className={`tier-card rank-card ${dragging ? "is-dragging" : ""}`} data-model-id={model.id} onContextMenu={(event) => { event.preventDefault(); }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onClick={onCycle} onKeyDown={(event) => { if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); onRemove(); } }} aria-label={`${model.name}. Drag to rank, press to cycle tiers, or press Delete to remove from this ballot.`} title="Drag to rank or reorder; tap to cycle tiers; press Delete to remove">
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
  const [excludedModelIds, setExcludedModelIds] = useState<string[]>([]);
  const [recentlyRemoved, setRecentlyRemoved] = useState<RemovedModel | null>(null);
  const [over, setOver] = useState<Tier | "unranked" | "trash" | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const [notice, setNotice] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [boardLoading, setBoardLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [removePickerOpen, setRemovePickerOpen] = useState(false);
  const [removeSearch, setRemoveSearch] = useState("");
  const [pendingModelIds, setPendingModelIds] = useState<string[]>([]);
  const [pinnedModels, setPinnedModels] = useState<CatalogApiModel[]>([]);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileGeneration, setTurnstileGeneration] = useState(0);
  const [pendingSave, setPendingSave] = useState<PendingBallotSave | null>(null);
  const [saving, setSaving] = useState(false);
  const [phoneLayout, setPhoneLayout] = useState(false);
  const [focusedModelId, setFocusedModelId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; modelId: string } | null>(null);
  const draggedModel = useRef<string | null>(null);
  const pointerDrag = useRef<{ modelId: string; pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressNextClick = useRef(false);
  const freshCategory = useRef<string | null>(null);
  const automaticSaveStarted = useRef(false);
  const saveInFlight = useRef(false);
  const { availableModels, catalogLoading } = useModelCatalog(pinnedModels);
  const newestModel = useMemo(() => newestCatalogModel(availableModels), [availableModels]);
  const retiredModelIds = useMemo(() => new Set(pinnedModels.filter((model) => model.status !== "active").map((model) => model.id)), [pinnedModels]);
  const excludedModels = useMemo(() => new Set(excludedModelIds), [excludedModelIds]);
  const rankedCount = countRankedPlacements(placements, excludedModelIds);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 850px)");
    const updateLayout = () => setPhoneLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const focus = params.get("focus");
    if (!focus) return;
    setFocusedModelId(focus);
    const timer = window.setTimeout(() => document.querySelector(`[data-model-id="${CSS.escape(focus)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }), 250);
    return () => window.clearTimeout(timer);
  }, [availableModels.length, boardLoading]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [contextMenu]);

  const starterModelIds = useMemo(() => new Set([...availableModels]
    .sort((left, right) => {
      const leftDate = new Date(left.release).getTime();
      const rightDate = new Date(right.release).getTime();
      return (Number.isNaN(rightDate) ? 0 : rightDate) - (Number.isNaN(leftDate) ? 0 : leftDate);
    })
    .slice(0, phoneLayout ? 10 : 20)
    .map((model) => model.id)), [availableModels, phoneLayout]);

  useEffect(() => {
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
        localStorage.setItem(ballotDraftOriginStorageKey(pending.category), authoredBallotOrigin);
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
      localStorage.removeItem(excludedModelStorageKey(targetCategory));
      localStorage.setItem(ballotDraftOriginStorageKey(targetCategory), authoredBallotOrigin);
      setPlacements({});
      setExcludedModelIds([]);
      setSubmitted(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (freshCategory.current === category) {
      freshCategory.current = null;
      localStorage.removeItem(storageKey(category));
      localStorage.removeItem(orderStorageKey(category));
      localStorage.removeItem(excludedModelStorageKey(category));
      localStorage.setItem(ballotDraftOriginStorageKey(category), authoredBallotOrigin);
      setPlacements({});
      setModelOrder([]);
      setExcludedModelIds([]);
      setRecentlyRemoved(null);
      setSubmitted(false);
      setNotice("");
      setBoardLoading(false);
      return () => controller.abort();
    }
    const local = localStorage.getItem(storageKey(category));
    const localOrder = localStorage.getItem(orderStorageKey(category));
    const localExcluded = localStorage.getItem(excludedModelStorageKey(category));
    const localOrigin = localStorage.getItem(ballotDraftOriginStorageKey(category));
    let localDraft: Placements = {};
    let localExcludedIds: string[] = [];
    try { localDraft = local ? JSON.parse(local) as Placements : {}; } catch { localStorage.removeItem(storageKey(category)); }
    try {
      const parsedOrder = localOrder ? JSON.parse(localOrder) as unknown : [];
      setModelOrder(Array.isArray(parsedOrder) ? parsedOrder.filter((id): id is string => typeof id === "string") : []);
    } catch {
      localStorage.removeItem(orderStorageKey(category));
      setModelOrder([]);
    }
    localExcludedIds = parseExcludedModelIds(localExcluded);
    setExcludedModelIds(localExcludedIds);
    if (localExcluded && localExcludedIds.length === 0) localStorage.removeItem(excludedModelStorageKey(category));
    setRecentlyRemoved(null);
    const hasLocalDraft = hasAuthoredLocalBallot(localDraft, localOrigin);
    setPlacements(localDraft);
    setSubmitted(false);
    setNotice("");
    // Visitors are intentionally allowed to build a local ballot before
    // signing in. Do not wait on an authenticated request in that mode.
    if (!authLoaded || !isSignedIn) {
      setBoardLoading(false);
      return () => controller.abort();
    }

    setBoardLoading(true);
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 8000);
    fetch(`/api/rankings?category=${encodeURIComponent(category)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { placements: Placements | null; models?: CatalogApiModel[] };
        setPinnedModels(Array.isArray(data.models) ? data.models : []);
        // A browser draft may predate sign-in. Never replace the work the user
        // can currently see with an older server revision behind their back.
        if (hasLocalDraft) return;
        const saved = restoreExcludedPlacements(data.placements ?? {}, localDraft, localExcludedIds);
        setPlacements(saved);
        setSubmitted(data.placements !== null);
        localStorage.setItem(storageKey(category), JSON.stringify(saved));
        localStorage.setItem(ballotDraftOriginStorageKey(category), serverBallotOrigin);
      })
      .catch(() => {
        if (timedOut) setNotice("The saved board took too long to load. Your local ballot is still available.");
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted || timedOut) setBoardLoading(false);
      });
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [authLoaded, category, isSignedIn]);

  const byTier = useMemo(() => {
    const result: Record<Tier | "unranked", Model[]> = { S: [], A: [], B: [], C: [], D: [], F: [], unranked: [] };
    const orderIndex = new Map(modelOrder.map((id, index) => [id, index]));
    availableModels
      .filter((model) => !excludedModels.has(model.id) && (starterModelIds.has(model.id) || model.id in placements))
      .sort((left, right) => (orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER))
      .forEach((model) => result[placements[model.id] ?? "unranked"].push(model));
    return result;
  }, [availableModels, excludedModels, modelOrder, placements, starterModelIds]);

  function place(modelId: string, tier: Tier | null) {
    setSubmitted(false);
    localStorage.setItem(ballotDraftOriginStorageKey(category), authoredBallotOrigin);
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
      const submittedPlacements = targetCategory === category ? omitExcludedPlacements(targetPlacements, excludedModelIds) as Placements : targetPlacements;
      const response = await fetch("/api/rankings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: targetCategory, placements: submittedPlacements, turnstileToken }) });
      const data = await response.json().catch(() => null) as { placements?: Placements; error?: string } | null;
      if (response.ok) {
        const saved = data?.placements ?? submittedPlacements;
        const localPlacements = targetCategory === category ? restoreExcludedPlacements(saved, targetPlacements, excludedModelIds) : saved;
        localStorage.setItem(storageKey(targetCategory), JSON.stringify(localPlacements));
        localStorage.setItem(ballotDraftOriginStorageKey(targetCategory), serverBallotOrigin);
        if (targetCategory === category) { setPlacements(localPlacements); setSubmitted(true); }
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

  function finishDrag() {
    draggedModel.current = null;
    pointerDrag.current = null;
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

  function dropTargetAtPoint(clientX: number, clientY: number): DropDestination | undefined {
    const element = document.elementFromPoint(clientX, clientY);
    if (element?.closest("[data-drop-trash]")) return { trash: true };
    const target = element?.closest<HTMLElement>("[data-drop-tier]");
    const dropTier = target?.dataset.dropTier;
    const tier = dropTier === "unranked" ? null : dropTier && tiers.includes(dropTier as Tier) ? dropTier as Tier : undefined;
    if (tier === undefined) return undefined;
    const container = target?.querySelector<HTMLElement>(dropTier === "unranked" ? ".unranked-list" : ".editor-dropzone");
    return container ? previewForContainer(tier, container, clientX, clientY) : { tier, afterTarget: false };
  }

  function previewDropTarget(target: DropDestination | undefined) {
    if (!target) {
      setOver(null);
      setDropPreview(null);
    } else if ("trash" in target) {
      setOver("trash");
      setDropPreview(null);
    } else {
      showDropPreview(target);
    }
  }

  function startPointerDrag(modelId: string, event: React.PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    pointerDrag.current = { modelId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    draggedModel.current = modelId;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePointerDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = pointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < 8) return;
      drag.moved = true;
    }
    event.preventDefault();
    const target = dropTargetAtPoint(event.clientX, event.clientY);
    previewDropTarget(target);
  }

  function endPointerDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = pointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      event.preventDefault();
      suppressNextClick.current = true;
      window.setTimeout(() => { suppressNextClick.current = false; }, 0);
      const target = dropTargetAtPoint(event.clientX, event.clientY);
      if (target) {
        if ("trash" in target) removeFromBallot(drag.modelId);
        else placeAndOrder(drag.modelId, target.tier, target.targetModelId, target.afterTarget);
      }
    }
    finishDrag();
  }

  function cancelPointerDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (pointerDrag.current?.pointerId === event.pointerId) finishDrag();
  }

  function cycleFromCard(modelId: string) {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    cycle(modelId);
  }

  function cycle(modelId: string) {
    const current = placements[modelId];
    const next = current ? tiers[tiers.indexOf(current) + 1] ?? null : "S";
    place(modelId, next);
  }

  function removeFromBallot(modelId: string) {
    const model = availableModels.find((item) => item.id === modelId);
    if (!model) return;
    const hadPlacement = Object.prototype.hasOwnProperty.call(placements, modelId);
    const tier = placements[modelId] ?? null;
    setExcludedModelIds((current) => {
      const next = current.includes(modelId) ? current : [...current, modelId];
      localStorage.setItem(excludedModelStorageKey(category), JSON.stringify(next));
      return next;
    });
    if (hadPlacement) localStorage.setItem(ballotDraftOriginStorageKey(category), authoredBallotOrigin);
    setSubmitted(false);
    setRecentlyRemoved({ id: modelId, name: model.name, hadPlacement, tier });
  }

  function restoreModel(modelId: string) {
    const remembered = recentlyRemoved?.id === modelId ? recentlyRemoved : null;
    setExcludedModelIds((current) => {
      const next = current.filter((id) => id !== modelId);
      if (next.length) localStorage.setItem(excludedModelStorageKey(category), JSON.stringify(next));
      else localStorage.removeItem(excludedModelStorageKey(category));
      return next;
    });
    if (remembered?.hadPlacement && !Object.prototype.hasOwnProperty.call(placements, modelId)) {
      setPlacements((current) => {
        const next = { ...current, [modelId]: remembered.tier };
        localStorage.setItem(storageKey(category), JSON.stringify(next));
        return next;
      });
    }
    if (remembered) setRecentlyRemoved(null);
    setSubmitted(false);
  }

  function undoRemove() {
    if (!recentlyRemoved) return;
    const removed = recentlyRemoved;
    setExcludedModelIds((current) => {
      const next = current.filter((id) => id !== removed.id);
      if (next.length) localStorage.setItem(excludedModelStorageKey(category), JSON.stringify(next));
      else localStorage.removeItem(excludedModelStorageKey(category));
      return next;
    });
    const nextOrigin = ballotOriginAfterUndo(removed.hadPlacement, localStorage.getItem(ballotDraftOriginStorageKey(category)));
    if (nextOrigin) localStorage.setItem(ballotDraftOriginStorageKey(category), nextOrigin);
    if (removed.hadPlacement) {
      setPlacements((current) => {
        const next = { ...current, [removed.id]: removed.tier };
        localStorage.setItem(storageKey(category), JSON.stringify(next));
        return next;
      });
    }
    setSubmitted(false);
    setRecentlyRemoved(null);
  }

  function reset() {
    setPlacements({});
    setModelOrder([]);
    setSubmitted(false);
    localStorage.removeItem(storageKey(category));
    localStorage.removeItem(orderStorageKey(category));
    localStorage.removeItem(excludedModelStorageKey(category));
    localStorage.setItem(ballotDraftOriginStorageKey(category), authoredBallotOrigin);
    setExcludedModelIds([]);
    setRecentlyRemoved(null);
    setNotice("This local ballot has been reset.");
  }

  function openModelPicker() {
    setPendingModelIds([]);
    setModelSearch("");
    setModelPickerOpen(true);
  }

  function openRemovePicker() {
    setRemoveSearch("");
    setRemovePickerOpen(true);
  }

  function addSelectedModels() {
    localStorage.setItem(ballotDraftOriginStorageKey(category), authoredBallotOrigin);
    setPlacements((current) => {
      const next = { ...current };
      pendingModelIds.forEach((id) => { if (!(id in next)) next[id] = null; });
      localStorage.setItem(storageKey(category), JSON.stringify(next));
      return next;
    });
    setExcludedModelIds((current) => {
      const next = current.filter((id) => !pendingModelIds.includes(id));
      if (next.length) localStorage.setItem(excludedModelStorageKey(category), JSON.stringify(next));
      else localStorage.removeItem(excludedModelStorageKey(category));
      return next;
    });
    if (recentlyRemoved && pendingModelIds.includes(recentlyRemoved.id)) setRecentlyRemoved(null);
    setSubmitted(false);
    setModelPickerOpen(false);
  }

  async function exportPng() {
    if (exporting || boardLoading) return;
    setExporting(true);
    const categoryName = categories.find((item) => item.slug === category)?.name ?? category;
    const rows = tiers.map((tier) => ({
      tier,
      color: tierMeta[tier].color,
      models: byTier[tier].map((model) => ({ name: model.name, color: model.color, mark: model.mark, maker: model.maker, logo: model.logo })),
    }));
    const pngPromise = renderBallotPng(categoryName, rows);
    const copyPromise = typeof ClipboardItem !== "undefined" && navigator.clipboard?.write
      ? navigator.clipboard.write([new ClipboardItem({ "image/png": pngPromise })]).then(() => true).catch(() => false)
      : Promise.resolve(false);
    try {
      const blob = await pngPromise;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tier-bench-${category}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const copied = await copyPromise;
      setNotice(copied ? "PNG saved to Downloads and copied to the clipboard." : "PNG saved to Downloads.");
    } catch {
      setNotice("We could not export this board as a PNG.");
    } finally {
      setExporting(false);
    }
  }

  const removeQuery = removeSearch.toLowerCase();
  const matchesRemoveQuery = (model: Model) => `${model.name} ${model.maker} ${model.id}`.toLowerCase().includes(removeQuery);
  const hiddenPickerModels = [...excludedModelIds].reverse().flatMap((id) => {
    const model = availableModels.find((item) => item.id === id);
    return model && matchesRemoveQuery(model) ? [model] : [];
  });
  const visiblePickerModels = Object.values(byTier).flat().filter(matchesRemoveQuery);

  function renderRankCards(modelsInTier: Model[], tier: Tier | null) {
    const preview = dropPreview?.tier === tier ? dropPreview : null;
    const dragged = draggedModel.current ? availableModels.find((model) => model.id === draggedModel.current) : undefined;
    const placeholder = dragged ? <RankPlaceholder key={`placeholder-${tier ?? "unranked"}`} model={dragged} /> : null;
    const cards = [];
    for (const model of modelsInTier) {
      if (preview?.targetModelId === model.id && !preview.afterTarget && placeholder) cards.push(placeholder);
      cards.push(<span key={model.id} className={focusedModelId === model.id ? "focused-rank-card" : ""} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, modelId: model.id }); }}><RankCard model={model} dragging={draggedModel.current === model.id} onPointerDown={(event) => startPointerDrag(model.id, event)} onPointerMove={movePointerDrag} onPointerUp={endPointerDrag} onPointerCancel={cancelPointerDrag} onCycle={() => cycleFromCard(model.id)} onRemove={() => removeFromBallot(model.id)} /></span>);
      if (preview?.targetModelId === model.id && preview.afterTarget && placeholder) cards.push(placeholder);
    }
    if (preview && !preview.targetModelId && placeholder) cards.push(placeholder);
    return cards;
  }

  return <><Header /><main className="page-shell rank-layout">
    <section className="rank-workspace" id="personal-editor">
      <div className="rank-overview">
        <div className="rank-overview-copy">
          <h1>Rank what you know.</h1>
          {!placements[newestModel.id] && !excludedModels.has(newestModel.id) && <div className="new-model-prompt"><span className="section-index">New on the board</span><strong>{newestModel.name}</strong><small>{newestModel.release} · {newestModel.description}</small><button className="button acid" onClick={rankNewest}>Propose a rank <span>↗</span></button></div>}
        </div>
      </div>
      {boardLoading && <div className="notice">Loading your saved {categories.find((item) => item.slug === category)?.name} board…</div>}
      {!boardLoading && notice && <div className="notice">{notice}</div>}
      <div className="rank-help"><span>Drag models between tiers. Within-tier order is kept for your personal view.</span><button onClick={reset}><svg viewBox="0 0 1920 1920" aria-hidden="true"><path fillRule="evenodd" d="M960 0v213.333c411.627 0 746.667 334.934 746.667 746.667S1371.627 1706.667 960 1706.667 213.333 1371.733 213.333 960c0-197.013 78.4-382.507 213.334-520.747v254.08H640V106.667H53.333V320h191.04C88.64 494.08 0 720.96 0 960c0 529.28 430.613 960 960 960s960-430.72 960-960S1489.387 0 960 0" /></svg>Reset ballot</button></div>
      <div className="editor-board">{tiers.map((tier) => <div className={`editor-row ${over === tier ? "drag-over" : ""}`} data-drop-tier={tier} key={tier}>
        <div className="editor-label" style={{ background: tierMeta[tier].color }}>{tier}</div>
        <div className="editor-dropzone">
          {renderRankCards(byTier[tier], tier)}
        </div>
      </div>)}</div>
      <div className={`unranked ${over === "unranked" ? "drag-over" : ""}`} data-drop-tier="unranked"><div className="bench-content"><div className="unranked-list">{renderRankCards(byTier.unranked, null)}</div><div className="bench-tools"><button type="button" className="add-model-card" onClick={openModelPicker} aria-label="Add a model to this board">+</button><button type="button" className={`trash-model-card ${over === "trash" ? "drag-over" : ""}`} data-drop-trash onClick={openRemovePicker} aria-label="Choose models to hide from this board in this browser. You can also drag a model here." title="Choose a model to hide, or drag one here"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></svg></button></div></div>{recentlyRemoved && <div className="removal-notice" role="status" aria-live="polite"><span>{recentlyRemoved.name} hidden from this board in this browser.</span><button type="button" onClick={undoRemove}>Undo</button></div>}</div>
      <div className="rank-submit"><Turnstile key={turnstileGeneration} onToken={setTurnstileToken} /><div className="rank-actions">{rankedCount > 0 && <button className="button acid" disabled={!authLoaded || saving || boardLoading || rankedCount < 5 || (Boolean(isSignedIn) && turnstileEnabled && !turnstileToken)} onClick={requestSave}>{saving ? "Saving…" : submitted ? "Update saved list" : "Save tier list"} <span>↗</span></button>}<button className="button" disabled={exporting || boardLoading} onClick={() => void exportPng()}>{exporting ? "Exporting…" : "Export as PNG"} <span>↗</span></button></div></div>
      <section className="criteria-suggestions"><span className="section-index">Keep going</span><h2>Rank the same models by another lens.</h2><p>Your personal opinion changes with the job. Open another private board for a criterion that matters to you.</p><input className="criteria-search" value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Search all categories..." aria-label="Search all categories" /><div className="criteria-suggestion-grid">{categories.filter((item) => item.slug !== category && `${item.name} ${item.short} ${item.prompt}`.toLowerCase().includes(categorySearch.toLowerCase())).map((item) => <button type="button" onClick={() => { setCategory(item.slug); history.replaceState(null, "", `/rank?category=${item.slug}`); document.querySelector("#personal-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="criteria-suggestion" key={item.slug}><strong>{item.name}</strong><span>{item.short}</span><small>{item.prompt}</small><b>Open board ↗</b></button>)}</div><Link className="text-link" href="/proposals">Suggest a new criterion ↗</Link></section>
    </section>
  </main>
  {modelPickerOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-model-title"><div className="modal model-picker"><button className="modal-close" onClick={() => setModelPickerOpen(false)}>×</button><span className="section-index">Add models</span><h2 id="add-model-title">Choose what belongs on the bench.</h2><input autoFocus value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="Search models…" aria-label="Search models" /><div className="model-picker-list">{availableModels.filter((model) => !retiredModelIds.has(model.id) && (excludedModels.has(model.id) || !(starterModelIds.has(model.id) || model.id in placements)) && `${model.name} ${model.maker} ${model.id}`.toLowerCase().includes(modelSearch.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)).map((model) => <label key={model.id}><input type="checkbox" checked={pendingModelIds.includes(model.id)} onChange={() => setPendingModelIds((current) => current.includes(model.id) ? current.filter((id) => id !== model.id) : [...current, model.id])} /><ModelMark model={model} small /><span>{model.name}</span></label>)}{catalogLoading && <p>Loading the OpenRouter catalog…</p>}{!catalogLoading && availableModels.every((model) => retiredModelIds.has(model.id) || (!excludedModels.has(model.id) && (starterModelIds.has(model.id) || model.id in placements))) && <p>Every available model is already on this board.</p>}</div><button className="button acid" disabled={pendingModelIds.length === 0} onClick={addSelectedModels}>Done <span>↗</span></button></div></div>}
  {removePickerOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="remove-model-title"><div className="modal model-picker remove-model-picker"><button className="modal-close" onClick={() => setRemovePickerOpen(false)} aria-label="Close remove-model picker">×</button><span className="section-index">Hide models locally</span><h2 id="remove-model-title">Not part of your ranking?</h2><p>Choose models to hide from this criterion on this browser. This does not delete them globally or hide them on your other devices.</p><input autoFocus value={removeSearch} onChange={(event) => setRemoveSearch(event.target.value)} placeholder="Search this board…" aria-label="Search models on this board" /><div className="remove-model-list">{hiddenPickerModels.map((model) => <button type="button" className="restore-model" key={`restore-${model.id}`} onClick={() => restoreModel(model.id)}><ModelMark model={model} small /><span><strong>{model.name}</strong><small>Hidden</small></span><b>Restore</b></button>)}{visiblePickerModels.map((model) => <button type="button" key={model.id} onClick={() => removeFromBallot(model.id)}><ModelMark model={model} small /><span><strong>{model.name}</strong><small>{placements[model.id] ?? "Unranked"}</small></span><b>Hide</b></button>)}{visiblePickerModels.length === 0 && excludedModelIds.length === 0 && <p>No models remain on this board.</p>}</div></div></div>}
  {contextMenu && <div className="model-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}><button type="button" role="menuitem" onClick={() => { removeFromBallot(contextMenu.modelId); setContextMenu(null); }}>Hide</button></div>}
  </>;
}
