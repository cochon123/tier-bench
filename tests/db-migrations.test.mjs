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
