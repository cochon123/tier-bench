"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { Model, Tier, tierMeta } from "./data";

export function Logo() {
  return <Link href="/" className="logo" aria-label="tier bench home"><span>tier</span><i>/</i><strong>bench</strong></Link>;
}

export function Header() {
  const path = usePathname();
  const { isLoaded, user } = useUser();
  return <header className="site-header">
    <Logo />
    <nav aria-label="Main navigation">
      <Link className={path === "/" ? "active" : ""} href="/">Boards</Link>
      <Link className={path.startsWith("/proposals") ? "active" : ""} href="/proposals">Proposals</Link>
      <Link className={path.startsWith("/methodology") ? "active" : ""} href="/methodology">Method</Link>
    </nav>
    <div className="header-actions">{isLoaded && (user ? <UserButton /> : <Link className="header-login" href="/login">Log in</Link>)}<Link className="button header-cta" href="/rank">Make a tier list <span>↗</span></Link></div>
  </header>;
}

export function Footer() {
  return <footer><Logo /><p>A small, non-commercial community project. Results may be cached for up to five minutes.</p><div><Link href="/methodology">Methodology</Link><span>Local demo · no account needed</span></div></footer>;
}

export function ModelMark({ model, small = false }: { model: Model; small?: boolean }) {
  const logoColors: Record<string, string> = { Anthropic: "#f5efe9", OpenAI: "#050505", Google: "#050505", DeepSeek: "#4f6ff0", Meta: "#0866ff", "xAI": "#050505", Mistral: "#f15a24", Qwen: "transparent", "Moonshot AI": "transparent", Xiaomi: "#ff6900", "Z.ai": "#171717" };
  const lightLogo = ["OpenAI", "DeepSeek", "Meta", "xAI", "Mistral", "Xiaomi", "Z.ai"].includes(model.maker);
  const squareLogo = ["Qwen", "Moonshot AI"].includes(model.maker);
  return <span className={`model-mark ${small ? "small" : ""} ${lightLogo ? "logo-light" : ""} ${squareLogo ? "square-logo" : ""}`} style={{ background: model.logo ? (logoColors[model.maker] ?? "#fff") : model.color }} aria-hidden="true">{model.logo ? <img src={model.logo} alt="" /> : model.mark}</span>;
}

export function ModelPill({ model, score, rank, compact = false }: { model: Model; score?: number; rank?: number; compact?: boolean }) {
  return <Link href={`/models/${model.id}`} className={`model-pill ${compact ? "compact" : ""}`}>
    {rank && <span className="rank">{String(rank).padStart(2, "0")}</span>}
    <ModelMark model={model} small={compact} />
    <span className="model-copy"><strong>{model.name}</strong></span>
    {score !== undefined && <b className="pill-score">{score.toFixed(2)}</b>}
    <span className="pill-arrow">↗</span>
  </Link>;
}

export function TierBadge({ tier }: { tier: Tier }) {
  return <span className="tier-badge" style={{ background: tierMeta[tier].color }}>{tier}</span>;
}
