"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { categories, leaderboard, modelById, tierMeta } from "../../data";
import { Footer, Header, ModelMark, RollingNumber, TierBadge } from "../../components";
import { useCommunityCount } from "../../use-community-count";

type Comment = { id: string; alias: string; body: string; created: string };
const animals = ["Amber Badger", "Quiet Heron", "Silver Stoat", "Patient Orca", "Clever Moth", "Mossy Fox"];

export default function ModelPage() {
  const params = useParams<{ id: string }>();
  const model = modelById(params.id);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const overall = useMemo(() => leaderboard("overall"), []);

  useEffect(() => {
    if (!model) return;
    const saved = localStorage.getItem(`tier-bench:comments:${model.id}`);
    if (saved) setComments(JSON.parse(saved));
  }, [model]);

  if (!model) return <><Header /><main className="page-intro"><span className="kicker">404</span><h1>That model isn’t on the bench.</h1><p>The local catalog may have changed.</p><Link className="button" href="/">Back to board</Link></main></>;

  const rank = overall.findIndex((item) => item.id === model.id) + 1;
  const item = overall[rank - 1];
  const { count: voters, spinKey: votersSpinKey } = useCommunityCount("overall", item.voters, model.id);
  const boardRows = categories.map((category) => {
    const board = leaderboard(category.slug); const index = board.findIndex((entry) => entry.id === model.id);
    return { category, rank: index + 1, item: board[index] };
  });
  const sShare = Math.round(5 + item.score * 6);
  const remaining = 100 - sShare;
  const distribution = [
    { tier: "S" as const, pct: sShare },
    { tier: "A" as const, pct: Math.round(remaining * .32) },
    { tier: "B" as const, pct: Math.round(remaining * .26) },
    { tier: "C" as const, pct: Math.round(remaining * .2) },
    { tier: "D" as const, pct: Math.round(remaining * .13) },
    { tier: "F" as const, pct: 0 },
  ];
  distribution[5].pct = 100 - distribution.slice(0, 5).reduce((sum, part) => sum + part.pct, 0);

  function addComment(event: FormEvent) {
    event.preventDefault(); if (!body.trim()) return;
    const comment = { id: Date.now().toString(36), alias: animals[model!.id.length % animals.length], body: body.trim().slice(0, 500), created: "just now" };
    const next = [comment, ...comments]; setComments(next); setBody(""); localStorage.setItem(`tier-bench:comments:${model!.id}`, JSON.stringify(next));
  }

  return <><Header /><main className="page-shell">
    <section className="model-hero"><div className="model-title"><ModelMark model={model} /><div><h1>{model.name}</h1><p>Current tracked release</p></div></div><div className="model-rank"><span>Overall community rank</span><strong>#{rank}</strong><div><TierBadge tier={item.tier} /> <small>{item.score.toFixed(2)} / 6 · <RollingNumber value={voters} spinKey={votersSpinKey} /> voters</small></div></div></section>
    <div className="model-content">
      <section className="content-block"><span className="section-index">01 / DISTRIBUTION</span><h2>Where the community places it</h2><div className="distribution">{distribution.filter(part => part.pct > 0).map((part) => <div key={part.tier} className="dist-part" style={{ width: `${part.pct}%`, background: tierMeta[part.tier].color }}><strong>{part.tier}</strong><span>{part.pct}%</span></div>)}</div></section>
      <section className="content-block"><span className="section-index">02 / SIX BOARDS</span><h2>Strengths, according to people</h2><div className="boards-list">{boardRows.map(({ category, rank: boardRank, item: boardItem }) => <div className="board-line" key={category.slug}><span>{category.name}</span><div><TierBadge tier={boardItem.tier} /></div><strong>#{boardRank} · {boardItem.score.toFixed(2)}</strong></div>)}</div></section>
      <section className="content-block"><span className="section-index">03 / COMMENTS</span><h2>Notes from the community</h2><form className="comment-form" onSubmit={addComment}><textarea maxLength={500} value={body} onChange={(event) => setBody(event.target.value)} placeholder={`What has your experience with ${model.name} been like?`} /><button className="button acid" type="submit">Post locally</button></form><div className="comments">{comments.length ? comments.map((comment) => <article className="comment" key={comment.id}><header><strong>{comment.alias}</strong><span>{comment.created} · anonymous local demo</span></header><p>{comment.body}</p></article>) : <div className="comment"><p>No notes yet. Start the thread.</p></div>}</div></section>
      <section className="content-block"><span className="section-index">04 / FACTS</span><h2>The factual bits</h2><div className="facts"><div className="fact"><span>Released</span><strong>{model.release}</strong></div><div className="fact"><span>Context</span><strong>{model.context}</strong></div><div className="fact"><span>Input / output</span><strong>{model.price}</strong></div><div className="fact"><span>Modalities</span><strong>Text + images</strong></div></div><p className="description">{model.description} Metadata here is seeded locally for the prototype and is intentionally separate from the community’s sentiment score.</p></section>
    </div>
  </main><Footer /></>;
}
