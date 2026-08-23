import Link from "next/link";
import { Footer, Header } from "../components";

export default function LoginPage() {
  return <><Header /><main className="page-shell login-page"><div className="login-card"><span className="section-index">ACCOUNT ACCESS</span><h1>Log in to tier/bench.</h1><p>Personal lists and saved rankings are coming soon. For now, everything on the community board is open to explore.</p><Link className="button acid" href="/">Back to the rankings <span>↗</span></Link></div></main><Footer /></>;
}
