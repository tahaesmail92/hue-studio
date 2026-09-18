// The single Postgres entry point. Nothing outside lib/db may import this —
// enforced by the no-restricted-imports rule in eslint.config.mjs.
import pg from "pg";
import { env } from "../env.ts";

const { Pool, types } = pg;

// How Postgres date/time types come back in JavaScript.
//
// A DATE (1082) and a TIMESTAMP WITHOUT TIME ZONE (1114) have no zone, so
// letting node-postgres build a Date from them applies the SERVER's offset and
// "2026-10-01" can arrive as the 30th of September. They stay strings.
//
// TIMESTAMPTZ (1184) is a real instant and must stay a Date: lib/time.ts
// renders it in the client's own timezone, which is the whole point.
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1114, (value) => value);

// Next dev reloads modules on every edit; without this the pool would leak a
// new set of connections per reload until Postgres refused them.
const globalForPool = globalThis as unknown as { __huePool?: pg.Pool };

export function pool(): pg.Pool {
  if (!globalForPool.__huePool) {
    globalForPool.__huePool = new Pool({
      connectionString: env.databaseUrl,
      max: env.dbPoolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    globalForPool.__huePool.on("error", (err) => {
      console.error("[db] idle client error", err);
    });
  }
  return globalForPool.__huePool;
}

/**
 * A dead pooled connection, as opposed to a rejected query.
 *
 * A pool can hand out a client whose socket the server has already closed -
 * after a restart, a failover, or a serverless Postgres suspending its compute
 * when idle, which Neon does by default. The first query on that client fails
 * before it ever reaches the database.
 */
function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return (
    /Connection terminated|socket hang up|ECONNRESET|read ECONNRESET/i.test(err.message) ||
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "ETIMEDOUT" ||
    // Postgres shutting down or dropping the session underneath us.
    code === "57P01" ||
    code === "57P02" ||
    code === "57P03"
  );
}

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  try {
    const result = await pool().query<T>(text, params);
    return result.rows;
  } catch (err) {
    if (!isConnectionError(err)) throw err;

    // Retried exactly once, and only for a connection that died before the
    // query was seen - so this cannot double-apply a write. node-postgres has
    // already evicted the broken client, so this asks for a fresh one.
    console.warn("[db] stale connection, retrying once");
    const result = await pool().query<T>(text, params);
    return result.rows;
  }
}

/** First row or null. Use for lookups by primary key or unique index. */
export async function one<T extends pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Runs fn inside a transaction, rolling back on any throw. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  try {
    return await runTransaction(fn);
  } catch (err) {
    // Only a transaction that provably never reached COMMIT may be retried.
    // If the connection died *during* commit, the server may have applied it,
    // and running it again would double-apply - so that case is rethrown.
    if (!(err instanceof StaleBeforeCommit)) throw err;

    console.warn("[db] stale connection before commit, retrying transaction once");
    return runTransaction(fn);
  }
}

/** Marks a connection failure that happened before COMMIT was attempted. */
class StaleBeforeCommit extends Error {
  constructor(readonly cause: unknown) {
    super("the connection died before the transaction was committed");
    this.name = "StaleBeforeCommit";
  }
}

async function runTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  let client: pg.PoolClient;
  try {
    client = await pool().connect();
  } catch (err) {
    if (isConnectionError(err)) throw new StaleBeforeCommit(err);
    throw err;
  }

  let committing = false;
  try {
    await client.query("begin");
    const result = await fn(client);
    committing = true;
    await client.query("commit");
    return result;
  } catch (err) {
    // A rollback on an already-dead connection throws too, and that error
    // would bury the one that actually explains the failure.
    try {
      await client.query("rollback");
    } catch {
      // The server has already discarded the transaction.
    }
    if (!committing && isConnectionError(err)) throw new StaleBeforeCommit(err);
    throw err;
  } finally {
    client.release();
  }
}
