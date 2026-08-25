import { clerkMiddleware } from "@clerk/nextjs/server";

// Pages are public-first. Mutating route handlers enforce authentication at the
// point of use so visitors can build a local ballot before they sign in.
export default clerkMiddleware();

export const config = {
  // Liveness must remain available even when Clerk configuration is broken;
  // the orchestrator needs to distinguish auth configuration from process death.
  matcher: ["/((?!_next|api/health|.*\\..*).*)"],
};
