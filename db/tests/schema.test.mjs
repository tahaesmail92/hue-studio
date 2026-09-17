// Runs every migration from scratch inside PGlite (real Postgres, compiled to
// WASM) and asserts the shape the application relies on. No server needed, so
// this runs in CI and on a laptop identically.
//
//   npm run test:db
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
// The migrations declare these; PGlite only has them if they are loaded here.
// btree_gist is the one that matters - it is what makes the no-double-booking
// exclusion constraint possible at all.
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function freshDatabase() {
  const db = new PGlite({ extensions: { citext, pgcrypto, btree_gist } });
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(files.length > 0, "there should be at least one migration");
  for (const file of files) {
    await db.exec(await readFile(join(migrationsDir, file), "utf8"));
  }
  return db;
}

/** A client, a producer and a photographer resource - the cast for most tests. */
async function seedCast(db) {
  const producer = await db.query(
    "insert into users (email, full_name, role) values ('p@hue.test', 'Producer', 'producer') returning id",
  );
  const client = await db.query(
    "insert into clients (name, slug, timezone) values ('Acme', 'acme', 'Africa/Cairo') returning id",
  );
  const photographer = await db.query(
    "insert into resources (kind, name, craft) values ('person', 'Sara', 'photographer') returning id",
  );
  return {
    producerId: producer.rows[0].id,
    clientId: client.rows[0].id,
    resourceId: photographer.rows[0].id,
  };
}

async function makeShoot(db, cast, { title, startsAt, endsAt, status = "confirmed" }) {
  const result = await db.query(
    `insert into shoots (client_id, created_by, title, timezone, status, starts_at, ends_at)
     values ($1, $2, $3, 'Africa/Cairo', $4, $5, $6) returning id, ref`,
    [cast.clientId, cast.producerId, title, status, startsAt, endsAt],
  );
  return result.rows[0];
}

async function book(db, shootId, resourceId) {
  await db.query("insert into shoot_resources (shoot_id, resource_id) values ($1, $2)", [
    shootId,
    resourceId,
  ]);
}

/** Postgres reports an exclusion violation as 23P01; PGlite nests it in `cause`. */
function isExclusionViolation(err) {
  assert.equal(err.code ?? err.cause?.code, "23P01");
  return true;
}

test("every migration applies in order on an empty database", async () => {
  const db = await freshDatabase();
  const result = await db.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`,
  );
  const tables = result.rows.map((r) => r.table_name);
  const expected = [
    "blackout_dates", "client_members", "clients", "deliverables", "email_log",
    "invites", "jobs", "notifications", "resources", "sessions", "settings",
    "shoot_events", "shoot_resources", "shoots", "users",
  ];
  for (const name of expected) {
    assert.ok(tables.includes(name), `missing table ${name}`);
  }
  await db.close();
});

test("the enums match what lib/types.ts declares", async () => {
  const db = await freshDatabase();
  const read = async (type) => {
    const result = await db.query(
      `select unnest(enum_range(null::${type}))::text as label`,
    );
    return result.rows.map((r) => r.label);
  };

  assert.deepEqual(await read("user_role"), ["admin", "producer", "crew", "client"]);
  assert.deepEqual(await read("shoot_status"), [
    "pending", "confirmed", "in_progress", "completed",
    "delivered", "cancelled", "rejected",
  ]);
  assert.deepEqual(await read("resource_kind"), ["person", "studio", "equipment"]);
  assert.deepEqual(await read("shoot_kind"), ["photo", "video", "both"]);
  await db.close();
});

test("settings is a single row that cannot be duplicated", async () => {
  const db = await freshDatabase();
  const result = await db.query("select count(*)::int as n from settings");
  assert.equal(result.rows[0].n, 1);
  await assert.rejects(() => db.query("insert into settings (id) values (true)"));
  await db.close();
});

test("a shoot needs only a title, and gets a reference number", async () => {
  const db = await freshDatabase();
  const cast = await seedCast(db);

  const result = await db.query(
    `insert into shoots (client_id, created_by, title, timezone)
     values ($1, $2, 'Autumn collection', 'Africa/Cairo') returning ref, status`,
    [cast.clientId, cast.producerId],
  );
  assert.match(result.rows[0].ref, /^SH-\d{4}-0001$/);
  assert.equal(result.rows[0].status, "pending");

  // A blank title is not a title.
  await assert.rejects(() =>
    db.query(
      `insert into shoots (client_id, created_by, title, timezone)
       values ($1, $2, '   ', 'Africa/Cairo')`,
      [cast.clientId, cast.producerId],
    ),
  );
  await db.close();
});

test("a confirmed shoot cannot exist without a scheduled window", async () => {
  const db = await freshDatabase();
  const cast = await seedCast(db);
  await assert.rejects(
    () =>
      db.query(
        `insert into shoots (client_id, created_by, title, timezone, status)
         values ($1, $2, 'No date', 'Africa/Cairo', 'confirmed')`,
        [cast.clientId, cast.producerId],
      ),
    /confirmed_shoot_is_scheduled/,
  );
  await db.close();
});

// ---------------------------------------------------------------------------
// The constraint the whole system exists for.
// ---------------------------------------------------------------------------

test("the same resource cannot be booked into overlapping confirmed shoots", async () => {
  const db = await freshDatabase();
  const cast = await seedCast(db);

  const morning = await makeShoot(db, cast, {
    title: "Morning",
    startsAt: "2026-10-01T09:00:00Z",
    endsAt: "2026-10-01T13:00:00Z",
  });
  await book(db, morning.id, cast.resourceId);

  const overlapping = await makeShoot(db, cast, {
    title: "Overlapping",
    startsAt: "2026-10-01T12:00:00Z",
    endsAt: "2026-10-01T15:00:00Z",
  });

  await assert.rejects(() => book(db, overlapping.id, cast.resourceId), isExclusionViolation);
  await db.close();
});

test("back-to-back bookings are allowed - a studio day runs that way", async () => {
  const db = await freshDatabase();
  const cast = await seedCast(db);

  const first = await makeShoot(db, cast, {
    title: "12 to 14",
    startsAt: "2026-10-02T12:00:00Z",
    endsAt: "2026-10-02T14:00:00Z",
  });
  await book(db, first.id, cast.resourceId);

  const second = await makeShoot(db, cast, {
    title: "14 to 16",
    startsAt: "2026-10-02T14:00:00Z",
    endsAt: "2026-10-02T16:00:00Z",
  });
  await book(db, second.id, cast.resourceId);

  const result = await db.query("select count(*)::int as n from shoot_resources where blocking");
  assert.equal(result.rows[0].n, 2);
  await db.close();
});

test("a pending request holds nothing, and claims the slot on confirmation", async () => {
  const db = await freshDatabase();
  const cast = await seedCast(db);

  // Two clients both ask for Thursday morning. Both requests are fine.
  const requestA = await makeShoot(db, cast, {
    title: "Request A", status: "pending",
    startsAt: "2026-10-03T09:00:00Z", endsAt: "2026-10-03T12:00:00Z",
  });
  const requestB = await makeShoot(db, cast, {
    title: "Request B", status: "pending",
    startsAt: "2026-10-03T10:00:00Z", endsAt: "2026-10-03T13:00:00Z",
  });
  await book(db, requestA.id, cast.resourceId);
  await book(db, requestB.id, cast.resourceId);

  const pending = await db.query("select bool_or(blocking) as held from shoot_resources");
  assert.equal(pending.rows[0].held, false, "a proposal must not hold the slot");

  // Confirming the first one claims it.
  await db.query("update shoots set status = 'confirmed' where id = $1", [requestA.id]);

  // Confirming the second can no longer succeed.
  await assert.rejects(
    () => db.query("update shoots set status = 'confirmed' where id = $1", [requestB.id]),
    isExclusionViolation,
  );
  await db.close();
});

test("cancelling a shoot frees the slot for someone else", async () => {
  const db = await freshDatabase();
  const cast = await seedCast(db);

  const booked = await makeShoot(db, cast, {
    title: "Booked",
    startsAt: "2026-10-04T09:00:00Z", endsAt: "2026-10-04T12:00:00Z",
  });
  await book(db, booked.id, cast.resourceId);

  const replacement = await makeShoot(db, cast, {
    title: "Replacement", status: "pending",
    startsAt: "2026-10-04T09:00:00Z", endsAt: "2026-10-04T12:00:00Z",
  });
  await book(db, replacement.id, cast.resourceId);

  await db.query("update shoots set status = 'cancelled' where id = $1", [booked.id]);
  await db.query("update shoots set status = 'confirmed' where id = $1", [replacement.id]);

  const result = await db.query(
    `select s.title from shoot_resources sr
       join shoots s on s.id = sr.shoot_id
      where sr.blocking`,
  );
  assert.deepEqual(result.rows.map((r) => r.title), ["Replacement"]);
  await db.close();
});

test("rescheduling a shoot moves its assignments with it", async () => {
  const db = await freshDatabase();
  const cast = await seedCast(db);

  const shoot = await makeShoot(db, cast, {
    title: "Moves",
    startsAt: "2026-10-05T09:00:00Z", endsAt: "2026-10-05T12:00:00Z",
  });
  await book(db, shoot.id, cast.resourceId);

  await db.query(
    `update shoots set starts_at = '2026-10-06T09:00:00Z', ends_at = '2026-10-06T12:00:00Z'
      where id = $1`,
    [shoot.id],
  );

  const result = await db.query("select starts_at from shoot_resources where shoot_id = $1", [
    shoot.id,
  ]);
  assert.equal(new Date(result.rows[0].starts_at).toISOString(), "2026-10-06T09:00:00.000Z");
  await db.close();
});

test("a resource cannot be assigned to a shoot with no window", async () => {
  const db = await freshDatabase();
  const cast = await seedCast(db);
  const result = await db.query(
    `insert into shoots (client_id, created_by, title, timezone)
     values ($1, $2, 'Undated', 'Africa/Cairo') returning id`,
    [cast.clientId, cast.producerId],
  );
  await assert.rejects(() => book(db, result.rows[0].id, cast.resourceId), /no scheduled window/);
  await db.close();
});

test("only a person resource carries a craft or a login", async () => {
  const db = await freshDatabase();
  await assert.rejects(
    () =>
      db.query(
        "insert into resources (kind, name, craft) values ('studio', 'Studio A', 'photographer')",
      ),
    /resource_craft_only_for_person/,
  );
  await db.close();
});

test("a user has at most one live invite per kind", async () => {
  const db = await freshDatabase();
  const created = await db.query(
    "insert into users (email, full_name, role) values ('c@hue.test', 'Client', 'client') returning id",
  );
  const userId = created.rows[0].id;
  const issue = (hash) =>
    db.query(
      `insert into invites (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '7 days')`,
      [userId, hash],
    );

  await issue("hash-one");
  await assert.rejects(() => issue("hash-two"), /invites_one_live/);

  // Accepting the first frees the slot for a later password reset.
  await db.query("update invites set accepted_at = now() where user_id = $1", [userId]);
  await issue("hash-three");
  await db.close();
});
