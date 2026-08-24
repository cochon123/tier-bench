import { NextResponse } from "next/server.js";

// Keep this endpoint dependency-free so the reverse proxy and container
// orchestrator can distinguish a running process from an application error.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "tier-bench",
      version: process.env.npm_package_version ?? "0.1.0",
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
