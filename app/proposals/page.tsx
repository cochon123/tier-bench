"use client";

import { FormEvent, useEffect, useState } from "react";
import { Footer, Header } from "../components";

type Proposal = { id: string; title: string; description: string; votes: number; status: string };
const defaults: Proposal[] = [
  { id: "research", title: "Deep research", description: "Which model can plan, browse sources, and synthesize a trustworthy answer?", votes: 184, status: "Needs clarification" },
  { id: "creative", title: "Creative writing", description: "Voice, originality, editing judgment, and the desire to keep reading.", votes: 139, status: "Under review" },
  { id: "local", title: "Best local model", description: "Useful capability on hardware a person can reasonably own.", votes: 96, status: "Open" },
];

export default function ProposalsPage() {
  const [proposals, setProposals] = useState(defaults);
  const [voted, setVoted] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => { const p = localStorage.getItem("tier-bench:proposals"), v = localStorage.getItem("tier-bench:votes"); if (p) setProposals(JSON.parse(p)); if (v) setVoted(JSON.parse(v)); }, []);
  function vote(id: string) { const active = voted.includes(id); const nextVotes = active ? voted.filter(item => item !== id) : [...voted, id]; const next = proposals.map(item => item.id === id ? { ...item, votes: item.votes + (active ? -1 : 1) } : item); setVoted(nextVotes); setProposals(next); localStorage.setItem("tier-bench:votes", JSON.stringify(nextVotes)); localStorage.setItem("tier-bench:proposals", JSON.stringify(next)); }
  function create(event: FormEvent) { event.preventDefault(); if (!title.trim() || !description.trim()) return; const next = [...proposals, { id: Date.now().toString(36), title: title.trim(), description: description.trim(), votes: 1, status: "Open" }]; setProposals(next); localStorage.setItem("tier-bench:proposals", JSON.stringify(next)); setTitle(""); setDescription(""); setOpen(false); }
  return <><Header /><main className="page-shell"><header className="page-intro"><span className="kicker">Community proposals</span><h1>What should we rank next?</h1><p>Votes surface demand; they do not automatically make a board. Clear questions become community betas after review.</p></header><section className="proposal-grid">{[...proposals].sort((a,b) => b.votes-a.votes).map((proposal) => <article className="proposal" key={proposal.id}><div className="vote-box"><button onClick={() => vote(proposal.id)} aria-label={`Vote for ${proposal.title}`}>{voted.includes(proposal.id) ? "◆" : "◇"}</button><strong>{proposal.votes}</strong></div><div><h2>{proposal.title}</h2><p>{proposal.description}</p></div><span>{proposal.status}</span></article>)}
    {open ? <form className="proposal-form" onSubmit={create}><input value={title} onChange={e => setTitle(e.target.value)} maxLength={60} placeholder="Board name" /><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={220} placeholder="What exact question should voters answer?" /><div><button type="button" className="button" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="button acid">Add locally</button></div></form> : <div className="new-proposal">Missing a category?<button className="button" onClick={() => setOpen(true)}>Propose one +</button></div>}
  </section></main><Footer /></>;
}
