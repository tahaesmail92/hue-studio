#!/usr/bin/env node
// Creates the first administrator, and prints the invite link to set a
// password with. Nothing is emailed and no password is generated: the same
// rule as every other account in the system.
//
//   npm run db:seed -- admin@huecreative.agency "Taha Esmail"
//
// Safe to run twice: an existing account is reissued a fresh invite instead,
// which is also how you recover from "I locked myself out".
import crypto from "node:crypto";
import pg from "pg";

// npm on Windows strips the quotes around "Taha Esmail", so the name arrives
// as several arguments. Everything after the email is the name.
const [email, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ").trim();

if (!email || !fullName) {
  console.error('Usage: npm run db:seed -- <email> "<full name>"');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const appUrl = process.env.APP_URL || "http://localhost:3000";
const ttlDays = Number(process.env.INVITE_TTL_DAYS || 7);

const rawToken = crypto.randomBytes(32).toString("base64url");
const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query("begin");

  const existing = await client.query("select id, role from users where email = $1", [email]);

  let userId;
  if (existing.rowCount > 0) {
    userId = existing.rows[0].id;
    console.log(`Account already exists (role: ${existing.rows[0].role}). Issuing a fresh invite.`);
    // Re-activate in case this is a lockout recovery.
    await client.query("update users set active = true where id = $1", [userId]);
  } else {
    const created = await client.query(
      `insert into users (email, full_name, role, locale)
       values ($1, $2, 'admin', coalesce($3::user_locale, 'ar')) returning id`,
      [email, fullName, process.env.DEFAULT_LOCALE || null],
    );
    userId = created.rows[0].id;
    console.log(`Created administrator ${fullName} <${email}>.`);
  }

  // invites_one_live permits a single unaccepted row per user and kind.
  await client.query(
    "delete from invites where user_id = $1 and kind = 'invite' and accepted_at is null",
    [userId],
  );
  await client.query(
    `insert into invites (user_id, kind, token_hash, expires_at)
     values ($1, 'invite', $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  await client.query("commit");
} catch (err) {
  await client.query("rollback");
  console.error(err);
  await client.end();
  process.exit(1);
}

await client.end();

console.log("");
console.log("Open this link to set a password:");
console.log(`  ${appUrl}/invite/${encodeURIComponent(rawToken)}`);
console.log("");
console.log(`It expires ${expiresAt.toISOString()} and works once.`);
