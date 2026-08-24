import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware(async (auth, request) => {
  if (request.nextUrl.pathname.startsWith("/rank")) {
    await auth.protect();
  }
});

export const config = {
  // Liveness must remain available even when Clerk configuration is broken;
  // the orchestrator needs to distinguish auth configuration from process death.
  matcher: ["/((?!_next|api/health|.*\\..*).*)"],
};
