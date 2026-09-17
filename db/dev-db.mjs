#!/usr/bin/env node
// A throwaway Postgres for local development, so `npm run dev` works on a
// machine without Docker: PGlite (real Postgres, WASM) served over the
// Postgres wire protocol on 5432. Data lives in .pgdata-dev and is disposable.
//
//   npm run dev:db
//
// Production uses the postgres container in docker-compose.yml.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

// The same contrib extensions the production Postgres image ships with, so a
// migration that works locally works on the VPS.
const db = await PGlite.create({
  dataDir: "./.pgdata-dev",
  extensions: { citext, pgcrypto, btree_gist },
});
const server = new PGLiteSocketServer({
  db,
  port: 5432,
  host: "127.0.0.1",
  // The default is a single connection, which the app pool exhausts on the
  // first parallel query and which wedges if a client dies abruptly.
  maxConnections: 10,
});

await server.start();
console.log("[dev-db] PGlite listening on 127.0.0.1:5432 (database: postgres, 10 connections)");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
