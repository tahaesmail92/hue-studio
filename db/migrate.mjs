#!/usr/bin/env node
// Applies pending SQL migrations in filename order, each inside its own
// transaction, and records what ran in schema_migrations.
//
//   npm run db:migrate
//
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "migrations");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

await client.query(
  "create table if not exists schema_migrations (" +
    "filename text primary key, applied_at timestamptz not null default now())",
);

const { rows } = await client.query("select filename from schema_migrations");
const applied = new Set(rows.map((r) => r.filename));

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
const pending = files.filter((f) => !applied.has(f));

if (pending.length === 0) {
  console.log("Nothing to apply - " + files.length + " migration(s) already in place.");
} else {
  for (const file of pending) {
    const sql = await readFile(join(migrationsDir, file), "utf8");
    process.stdout.write("applying " + file + " ... ");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (filename) values ($1)", [file]);
      await client.query("commit");
      console.log("ok");
    } catch (err) {
      await client.query("rollback");
      console.log("FAILED");
      console.error(err);
      await client.end();
      process.exit(1);
    }
  }
  console.log("Applied " + pending.length + " migration(s).");
}

await client.end();
