import postgres from "postgres";

/**
 * The application can still be built without a database configured (useful for
 * previews), but every write route returns a clear 503 in that case. Keeping
 * the client in one module also prevents a new connection being opened for
 * every request in a warm Next.js process.
 */
const connectionString = process.env.DATABASE_URL;

export const sql = connectionString
  ? postgres(connectionString, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    })
  : null;

export const databaseConfigured = Boolean(sql);

export function databaseUnavailable() {
  return new Response(JSON.stringify({ error: "Database is not configured" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

export type BallotPlacements = Record<string, string | null>;

export const DB_ERROR = "Database request failed";
