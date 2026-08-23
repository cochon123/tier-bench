import Link from "next/link";
import { Footer, Header } from "../components";

export default function SignupPage() {
  return <><Header /><main className="page-shell login-page"><div className="login-card"><span className="section-index">PUBLISH YOUR LIST</span><h1>Create your tier/bench account.</h1><p>Sign up to submit your ranking to the community. Account creation is coming soon, so your draft is still safe in this browser for now.</p><div className="signup-actions"><Link className="button acid" href="/">Back to the rankings <span>↗</span></Link><Link className="text-link" href="/rank">Keep editing</Link></div></div></main><Footer /></>;
}
