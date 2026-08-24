"use client";

import { FormEvent, useEffect, useState } from "react";
import { Footer, Header } from "../components";

type Proposal = { id: string; title: string; description: string; votes: number; status: string };

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<(Proposal & { voted?: boolean })[]>([]);
  const [voted, setVoted] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notice, setNotice] = useState("");
  async function load() { const response = await fetch("/api/proposals"); if (!response.ok) { setNotice("Proposals are temporarily unavailable."); return; } const data = await response.json(); setProposals(data.proposals ?? []); setVoted((data.proposals ?? []).filter((item: Proposal & { voted?: boolean }) => item.voted).map((item: Proposal) => item.id)); }
  useEffect(() => { load().catch(() => setNotice("Proposals are temporarily unavailable.")); }, []);
  async function vote(id: string) { const response = await fetch(`/api/proposals/${id}/vote`, { method: "POST" }); if (response.status === 401) { setNotice("Log in to vote on a proposal."); return; } if (!response.ok) { setNotice("We could not save that vote."); return; } const result = await response.json(); setProposals((current) => current.map(item => item.id === id ? { ...item, votes: result.votes, voted: result.voted } : item)); setVoted((current) => result.voted ? [...current.filter(item => item !== id), id] : current.filter(item => item !== id)); }
  async function create(event: FormEvent) { event.preventDefault(); const response = await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description }) }); if (response.status === 401) { setNotice("Log in to propose a board."); return; } if (!response.ok) { const data = await response.json().catch(() => null); setNotice(data?.error ?? "We could not create that proposal."); return; } const data = await response.json(); setProposals((current) => [...current, data.proposal]); setTitle(""); setDescription(""); setOpen(false); setNotice("Proposal added."); }
  return <><Header /><main className="page-shell"><header className="page-intro"><span className="kicker">Community proposals</span><h1>What should we rank next?</h1><p>Votes surface demand; they do not automatically make a board. Clear questions become community betas after review.</p></header><section className="proposal-grid">{notice && <div className="notice">{notice}</div>}{[...proposals].sort((a,b) => b.votes-a.votes).map((proposal) => <article className="proposal" key={proposal.id}><div className="vote-box"><button onClick={() => vote(proposal.id)} aria-label={`Vote for ${proposal.title}`}>{voted.includes(proposal.id) ? "◆" : "◇"}</button><strong>{proposal.votes}</strong></div><div><h2>{proposal.title}</h2><p>{proposal.description}</p></div><span>{proposal.status}</span></article>)}
    {open ? <form className="proposal-form" onSubmit={create}><input value={title} onChange={e => setTitle(e.target.value)} maxLength={60} placeholder="Board name" /><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={220} placeholder="What exact question should voters answer?" /><div><button type="button" className="button" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="button acid">Add proposal</button></div></form> : <div className="new-proposal">Missing a category?<button className="button" onClick={() => setOpen(true)}>Propose one +</button></div>}
  </section></main><Footer /></>;
}
