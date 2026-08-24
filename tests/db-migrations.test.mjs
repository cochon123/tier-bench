import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postgres from "postgres";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to test migrations");
}

async function runMigrations() {
  await execFileAsync(process.execPath, ["db/migrate.mjs"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

test("all migrations apply and a second run is a no-op", async () => {
  await runMigrations();

  const migrationFiles = (await fs.readdir(path.join(root, "db/migrations")))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const expectedVersions = migrationFiles.map((file) => file.replace(/\.sql$/, ""));
  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const applied = await sql`
      select version, applied_at::text as applied_at
      from schema_migrations
      order by version
    `;
    assert.deepEqual(
      applied.map(({ version }) => version),
      expectedVersions,
      "the database should record every checked-in migration exactly once",
    );

    const [relations] = await sql`
      select
        to_regclass('public.ballots')::text as ballots,
        to_regclass('public.ballot_revisions')::text as ballot_revisions,
        to_regclass('public.model_catalog')::text as model_catalog,
        to_regclass('public.model_default_mappings')::text as model_default_mappings,
        to_regclass('public.active_model_catalog')::text as active_model_catalog,
        to_regclass('public.rate_limit_buckets')::text as rate_limit_buckets
    `;
    assert.deepEqual(relations, {
      ballots: "ballots",
      ballot_revisions: "ballot_revisions",
      model_catalog: "model_catalog",
      model_default_mappings: "model_default_mappings",
      active_model_catalog: "active_model_catalog",
      rate_limit_buckets: "rate_limit_buckets",
    });

    const [seeded] = await sql`
      select count(*)::integer as count
      from model_default_mappings
      where active
    `;
    assert.equal(seeded.count, 18, "all shipped default models should be seeded");

    const releaseDates = await sql`
      select m.default_model_id as id, c.released_at::date::text as released_at
      from model_default_mappings m
      join model_catalog c on c.canonical_slug = m.canonical_slug
      where m.active
      order by m.display_order
    `;
    assert.deepEqual(releaseDates.map(({ id, released_at }) => ({ id, released_at })), [
      { id: "claude-fable-5", released_at: "2026-08-18" },
      { id: "claude-mythos-5", released_at: "2026-08-14" },
      { id: "claude-opus-5", released_at: "2026-08-11" },
      { id: "claude-sonnet-5", released_at: "2026-08-08" },
      { id: "gpt-5-6-terra", released_at: "2026-08-16" },
      { id: "gpt-5-6-luna", released_at: "2026-08-16" },
      { id: "gpt-5-6-sol", released_at: "2026-08-16" },
      { id: "glm-5-3", released_at: "2026-08-12" },
      { id: "deepseek-v4-pro", released_at: "2026-08-13" },
      { id: "mimo-v2-5-pro", released_at: "2026-08-09" },
      { id: "mistral-large", released_at: "2026-08-02" },
      { id: "qwen-3-8-27b", released_at: "2026-08-15" },
      { id: "qwen-3-8-max", released_at: "2026-08-15" },
      { id: "muse-glimmer", released_at: "2026-08-06" },
      { id: "gemini-3-1-pro", released_at: "2026-08-04" },
      { id: "gemini-3-7-flash", released_at: "2026-08-17" },
      { id: "kimi-k3", released_at: "2026-08-10" },
      { id: "grok-4-6", released_at: "2026-08-07" },
    ]);

    const firstAppliedAt = applied.map(({ version, applied_at }) => [version, applied_at]);
    await runMigrations();
    const afterSecondRun = await sql`
      select version, applied_at::text as applied_at
      from schema_migrations
      order by version
    `;
    assert.deepEqual(
      afterSecondRun.map(({ version, applied_at }) => [version, applied_at]),
      firstAppliedAt,
      "an idempotent run must not reapply or retimestamp migrations",
    );
  } finally {
    await sql.end();
  }
});
