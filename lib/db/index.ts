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

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool().query<T>(text, params);
  return result.rows;
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
  const client = await pool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
