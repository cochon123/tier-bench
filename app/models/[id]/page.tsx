"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { categories, Tier, tierForScore, tierMeta } from "../../data";
import { Footer, Header, ModelMark, TierBadge } from "../../components";
import { useModelCatalog } from "../../use-model-catalog";

type Comment = { id: string; alias: string; body: string; createdAt: string };
type Result = { score: number; voters: number; distribution: Record<Tier, number> };

export default function ModelPage() {
  const params = useParams<{ id: string }>();
  const { availableModels, catalogLoading } = useModelCatalog();
  const modelId = decodeURIComponent(params.id);
  const model = availableModels.find((item) => item.id === modelId);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [boards, setBoards] = useState<Record<string, Record<string, Result>>>({});

  useEffect(() => {
    if (!model) return;
    fetch(`/api/comments/${encodeURIComponent(model.id)}`).then((response) => response.ok ? response.json() : { comments: [] }).then((data) => setComments(data.comments ?? [])).catch(() => {});
    Promise.all(categories.map(async (category) => {
      const response = await fetch(`/api/community-board?category=${encodeURIComponent(category.slug)}`);
      const data = response.ok ? await response.json() : { scores: {} };
      return [category.slug, data.scores ?? {}] as const;
    })).then((entries) => setBoards(Object.fromEntries(entries))).catch(() => {});
  }, [model?.id]);

  if (!model && catalogLoading) return <><Header /><main className="page-intro"><p>Loading model details…</p></main></>;
  if (!model) return <><Header /><main className="page-intro"><span className="kicker">404</span><h1>That model isn’t on the bench.</h1><p>The local catalog may have changed.</p><Link className="button" href="/">Back to board</Link></main></>;

  const overall = boards.overall ?? {};
  const item = overall[model.id];
  const overallOrder = Object.entries(overall).sort(([, a], [, b]) => b.score - a.score || b.voters - a.voters);
  const rank = overallOrder.findIndex(([id]) => id === model.id) + 1;
  const boardRows = categories.map((category) => {
    const board = boards[category.slug] ?? {}; const ordered = Object.entries(board).sort(([, a], [, b]) => b.score - a.score || b.voters - a.voters);
    const result = board[model.id];
    return { category, rank: result ? ordered.findIndex(([id]) => id === model.id) + 1 : null, item: result };
  });
  const distribution = (Object.keys(tierMeta) as Tier[]).map((tier) => ({ tier, pct: item?.voters ? Math.round(item.distribution[tier] / item.voters * 100) : 0 }));
  const modalities = model.inputModalities?.length || model.outputModalities?.length
    ? `${model.inputModalities?.join(" + ") || "unknown"} → ${model.outputModalities?.join(" + ") || "unknown"}`
    : "Not reported";

  async function addComment(event: FormEvent) {
    event.preventDefault(); if (!body.trim()) return;
    const response = await fetch(`/api/comments/${encodeURIComponent(model!.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    if (response.status === 401) { window.alert("Log in to post a note."); return; }
    if (!response.ok) return;
    const data = await response.json(); setComments((current) => [data.comment, ...current]); setBody("");
  }

  return <><Header /><main className="page-shell">
    <section className="model-hero"><div className="model-title"><ModelMark model={model} /><div><h1>{model.name}</h1><p>Current tracked release</p></div></div><div className="model-rank"><span>Overall community rank</span>{item ? <><strong>#{rank}</strong><div><TierBadge tier={tierForScore(item.score)} /> <small>{item.score.toFixed(2)} / 6 · {item.voters} voters</small></div></> : <p>No saved community placements yet.</p>}</div></section>
    <div className="model-content">
      <section className="content-block"><span className="section-index">01 / DISTRIBUTION</span><h2>Where the community places it</h2>{item ? <div className="distribution">{distribution.filter(part => part.pct > 0).map((part) => <div key={part.tier} className="dist-part" style={{ width: `${part.pct}%`, background: tierMeta[part.tier].color }}><strong>{part.tier}</strong><span>{part.pct}%</span></div>)}</div> : <p>No distribution exists until someone saves a ballot containing this model.</p>}</section>
      <section className="content-block"><span className="section-index">02 / SIX BOARDS</span><h2>Strengths, according to people</h2><div className="boards-list">{boardRows.map(({ category, rank: boardRank, item: boardItem }) => <div className="board-line" key={category.slug}><span>{category.name}</span>{boardItem ? <><div><TierBadge tier={tierForScore(boardItem.score)} /></div><strong>#{boardRank} · {boardItem.score.toFixed(2)}</strong></> : <strong>No placements</strong>}</div>)}</div></section>
      <section className="content-block"><span className="section-index">03 / COMMENTS</span><h2>Notes from the community</h2><form className="comment-form" onSubmit={addComment}><textarea maxLength={500} value={body} onChange={(event) => setBody(event.target.value)} placeholder={`What has your experience with ${model.name} been like?`} /><button className="button acid" type="submit">Post a note</button></form><div className="comments">{comments.length ? comments.map((comment) => <article className="comment" key={comment.id}><header><strong>{comment.alias}</strong><span>{new Date(comment.createdAt).toLocaleDateString()}</span></header><p>{comment.body}</p></article>) : <div className="comment"><p>No notes yet. Start the thread.</p></div>}</div></section>
      <section className="content-block"><span className="section-index">04 / FACTS</span><h2>The factual bits</h2><div className="facts"><div className="fact"><span>Released</span><strong>{model.release}</strong></div><div className="fact"><span>Context</span><strong>{model.context}</strong></div><div className="fact"><span>Input / output</span><strong>{model.price}</strong></div><div className="fact"><span>Modalities</span><strong>{modalities}</strong></div></div><p className="description">{model.description} Catalog metadata is intentionally separate from the community’s sentiment score.</p></section>
    </div>
  </main><Footer /></>;
}
