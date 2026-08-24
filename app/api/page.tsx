import { Footer, Header } from "../components";
import { boardAt, today } from "./v1/_lib/history";

export const dynamic = "force-dynamic";

const endpoints = [
  { method: "GET", path: "/api/v1/leaderboards", title: "Board directory", detail: "Every public category, its leader, coverage, voter count, and canonical URL." },
  { method: "GET", path: "/api/v1/leaderboards/{slug}?at=YYYY-MM-DD", title: "Leaderboard at a moment", detail: "Reconstruct a complete ranked board on any available date, including confidence intervals and tier distributions." },
  { method: "GET", path: "/api/v1/models?provider=&released_after=&q=", title: "Model catalog", detail: "Filter releases by provider, release date, or text and discover stable model IDs." },
  { method: "GET", path: "/api/v1/models/{id}/history?category=overall,math&interval=day", title: "Full model history", detail: "Chart score, rank, tier, voters, confidence, and S–F distribution across one or many boards." },
  { method: "GET", path: "/api/v1/timeseries?models=id,id&category=overall", title: "Comparison series", detail: "Fetch aligned daily or weekly points for up to ten models in one request." },
];

export default async function ApiPage() {
  const at = today();
  const sample = (await boardAt("overall", at)).slice(0, 2).map(({ id, rank, tier, score, voters, confidence, distribution }) => ({ id, rank, tier, score, voters, confidence, distribution }));
  const sampleJson = JSON.stringify({ data: sample, meta: { apiVersion: "1.0", algorithm: "revision-mean-v1", category: "overall", at, source: "persisted ballot revisions" } }, null, 2);
  return <><Header /><main className="api-docs">
    <section className="api-hero"><span className="kicker">Developer API · v1</span><h1>Historical model ranking data.</h1><p>Access leaderboard snapshots, model metadata, scores, ranks, tiers, vote counts, confidence intervals, and time series through a public JSON API.</p><div className="api-hero-meta"><span>Public JSON</span><span>No key required</span><span>Daily snapshots</span><span>5-minute cache</span></div></section>
    <section className="api-capabilities"><article><b>01</b><h2>Historical snapshots</h2><p>Pass <code>?at=2026-08-18</code> to retrieve the leaderboard for a specific date.</p></article><article><b>02</b><h2>Ranking fields</h2><p>Each record includes rank, score, tier, voter count, confidence bounds, and the complete S–F distribution.</p></article><article><b>03</b><h2>Time series</h2><p>Request up to ten aligned model series at daily or weekly resolution.</p></article></section>
    <section className="api-reference"><div className="api-section-head"><span className="section-index">Endpoints</span><h2>Endpoint reference.</h2><p>Successful responses contain a <code>data</code> payload and a <code>meta</code> object containing the data window, algorithm version, and generation time.</p></div><div className="api-route-list">{endpoints.map((endpoint) => <article key={endpoint.path}><div><span>{endpoint.method}</span><code>{endpoint.path}</code></div><div><h3>{endpoint.title}</h3><p>{endpoint.detail}</p></div></article>)}</div></section>
    <section className="api-playground"><div><span className="section-index">Example request</span><h2>Time series response.</h2><p>Returns aligned daily or weekly points for the requested models and category.</p><pre><code>{`curl '/api/v1/timeseries?models=gpt-5-6-sol,claude-opus-5&category=overall&from=2026-08-11&interval=day'`}</code></pre><a className="button acid" href="/api/v1/timeseries?models=gpt-5-6-sol,claude-opus-5&category=overall&from=2026-08-11&interval=day">View JSON <span>↗</span></a></div><pre className="api-response"><code>{sampleJson}</code></pre></section>
    <section className="api-contract"><div><span className="section-index">Historical contract</span><h2>History stays interpretable.</h2></div><div><p>Each point is reconstructed from immutable ballot revisions and identifies the aggregation algorithm that produced it. A methodology change creates a new algorithm version instead of silently rewriting old scores.</p><p>Dates are UTC in <code>YYYY-MM-DD</code> form. Unknown IDs return structured errors. Dates without saved ballots honestly return an empty data set.</p></div></section>
  </main><Footer /></>;
}
