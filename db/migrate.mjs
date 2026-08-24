import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required to run migrations");
const sql = postgres(url, { max: 1, prepare: false });
try {
  await sql`create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())`;
  const directory = path.dirname(new URL(import.meta.url).pathname);
  const files = (await fs.readdir(path.join(directory, "migrations"))).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const applied = await sql`select 1 from schema_migrations where version = ${version}`;
    if (applied.length) continue;
    const contents = await fs.readFile(path.join(directory, "migrations", file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`insert into schema_migrations (version) values (${version})`;
    });
    console.log(`Applied ${version}`);
  }
} finally {
  await sql.end();
}
