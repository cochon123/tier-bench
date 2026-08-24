import { sql } from "./db.ts";
import { createHash } from "node:crypto";

/**
 * A fixed-window limiter stored in PostgreSQL. This is deliberately shared by
 * every application process: restarting or horizontally scaling the web app
 * cannot reset a caller's allowance.
 */
export async function rateLimit(key: string, limit: number, windowMs: number) {
  if (!sql) return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const rows = await sql`
    insert into rate_limit_buckets (key, window_id, count, expires_at)
    values (${key}, ${bucket}, 1, now() + (${windowSeconds} * interval '1 second'))
    on conflict (key, window_id) do update set count = rate_limit_buckets.count + 1
    returning count, greatest(1, ceil(extract(epoch from (expires_at - now()))))::int as retry_after
  `;
  // Keep storage bounded without putting a cleanup job on the critical path.
  if (Math.random() < 0.01) void sql`delete from rate_limit_buckets where expires_at < now()`;
  return { allowed: Number(rows[0].count) <= limit, retryAfter: Number(rows[0].retry_after) };
}

export function rateLimitResponse(retryAfter: number) {
  return new Response(JSON.stringify({ error: "Too many requests", retryAfter }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });
}

export async function publicRateLimit(request: Request, scope: string, limit = 120, windowMs = 60_000) {
  const address = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
  const fingerprint = createHash("sha256").update(address).digest("hex").slice(0, 24);
  return rateLimit(`public:${scope}:${fingerprint}`, limit, windowMs);
}
