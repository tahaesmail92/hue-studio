# HUE Studio

Booking and management for HUE Creative Group's media production department.
A client requests a shoot, production approves or reshapes it, the client gets
one formal confirmation, and the footage is handed over against a record of
what was agreed.

Arabic and English, right-to-left and left-to-right, from the first screen.

---

## Running it locally

```bash
npm install
cp .env.example .env
npm run dev:db      # PGlite on 5432 - a real Postgres, no Docker needed
npm run db:migrate
npm run db:seed -- you@huecreative.agency "Your Name"
npm run dev
```

The seed prints an invite link. Open it to choose a password.

**No password is ever generated or emailed** — not here, not for clients, not
for crew. An account is created dormant and activated through a one-time link.
That is a deliberate departure from the original spec, which called for
emailing a generated password the recipient could not change: an emailed
password stays readable in the mailbox forever, and locking people out of
changing it turns the producer into a password helpdesk.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The app on :3000 |
| `npm run dev:db` | Throwaway Postgres in `.pgdata-dev` |
| `npm run db:migrate` | Applies pending `db/migrations/*.sql` |
| `npm run db:seed -- <email> "<name>"` | First admin, or a fresh invite for an existing one |
| `npm run worker` | The queue consumer: emails and reminders |
| `npm test` | Schema tests against PGlite |
| `npm run lint` · `npx tsc --noEmit` | |

## How it is put together

**Next.js 16 App Router, Postgres through `pg`, no ORM, no UI kit.** Server
Components read through repositories; mutations are Server Actions.

### Authorization lives in the data layer

There is no row-level security — only this server talks to Postgres — so every
repository function takes a `Ctx` as its first argument and scopes its own
query. A page that forgets to filter still cannot show one client another
client's work.

```ts
type Ctx = {
  userId: string;
  role: "admin" | "producer" | "crew" | "client";
  allClients: boolean;        // admin and producer
  clientIds: string[];        // a client user's companies
  resourceId: string | null;  // a crew user's bookable self
};
```

`requireRole()` throws, for Server Actions. `requirePageRole()` redirects, for
navigation: a producer following a stale bookmark to `/portal` has not done
anything wrong.

### Double booking is impossible, not discouraged

A photographer, a studio and a camera body are one problem — one of them, in
one place, at one time — so they are one `resources` table, and one exclusion
constraint protects all three:

```sql
exclude using gist (resource_id with =, during with &&) where (blocking)
```

Two producers confirming the same slot at the same moment both pass any
application-level check. Postgres refuses the second one.

`blocking` is set by trigger from the parent shoot's status. **A pending
request holds nothing** — three clients may ask for Thursday morning and all
three requests sit there happily; the first one confirmed claims the slot and
the others can no longer be confirmed into it. `db/tests/schema.test.mjs`
proves each of these.

### Naming

The thing a client books is a **shoot**, never a "session" — `sessions` is the
auth table. In Arabic the UI says *جلسة*; in code it is a shoot, everywhere.

### Time

Shoots are scheduled in the **client's** timezone: a Riyadh client's 9am is 9am
in Riyadh even when the producer is in Cairo. `timestamptz` throughout, with
`lib/time.ts` converting a `datetime-local` value across DST correctly, and the
zone copied onto the shoot at creation so a confirmation already sent keeps
meaning what it said.

`DATE` and `TIMESTAMP` come back from Postgres as **strings** (see
`lib/db/index.ts`) — letting node-postgres build a `Date` from a zoneless value
applies the server's offset and `2026-10-01` arrives as the 30th of September.
`TIMESTAMPTZ` stays a real `Date`, because that is a real instant.

### Language

`lib/i18n/ar.ts` is the source dictionary and `en.ts` is typed against its
*shape*, so a key added to one and forgotten in the other fails `tsc`. The
locale lives in a cookie and on the account; switching it while signed in saves
the choice, so the next sign-in on any device starts in the same language.

Latin digits everywhere inside the system, including the Arabic UI — the team
reads references and times faster in them and they survive a copy-paste into
WhatsApp. Arabic-Indic digits are for client-facing PDFs only.

### Email

Every message goes through the job queue rather than being sent inside a
request, so a provider outage retries instead of losing a confirmation. Without
`RESEND_API_KEY` sends are recorded in `email_log` as `skipped` and the app
carries on — local development never blocks on a mail provider, and in
production a missing key shows up in the log rather than as a crash.

### Reminders fire once

The job queue's dedupe key cannot express "already sent": that index only
covers pending and running rows, so it frees the instant a job completes and
the next tick would queue the same reminder again — once a minute, all day, to
a client. `shoot_reminders` is the durable record instead, claimed *before*
the send, so a crash mid-send drops a reminder rather than repeating it.

### Client-facing modules must not import the pool

`eslint.config.mjs` forbids `app/**` and `components/**` from importing
`pg` or `@/lib/db`. One lint run is the whole audit.

`server-only` is used in `lib/auth/*` but deliberately **not** in
`lib/db/repo/*`, `lib/mail/*` or `lib/queue/*` — the worker is a plain Node
process that shares those modules, and `server-only` throws outside Next's
bundler.

## Deployment

One Hostinger VPS, five containers: `postgres`, `web`, `worker`, `caddy`,
`backup`. Caddy gets TLS automatically. Pushing to `main` runs the tests and
deploys. **The full runbook is [DEPLOY.md](DEPLOY.md)**; the short version:

```bash
# on the VPS
cp .env.example .env         # set POSTGRES_PASSWORD, APP_DOMAIN, APP_URL, RESEND_API_KEY
docker compose up -d --build
docker compose exec web node db/migrate.mjs
docker compose exec web node db/seed.mjs you@huecreative.agency "Your Name"
```

Write secrets into `.env` over `scp` or a heredoc rather than pasting them into
a web console: pasting long keys in a right-to-left environment has corrupted
them before.

`docker/backup.sh` takes a nightly `pg_dump` with 14-day retention into the
`backups` volume. **Copying those dumps off the box is a separate, deliberate
step** — a backup that only exists on the machine it protects is not a backup.

## Status

Complete and walked end to end: a client submits, production approves with
crew and studio assigned, the client receives a formal confirmation as a PDF
and a link that opens without signing in, the crew work from a call sheet, the
files are handed over as Drive links, and the client approves the final cut.
Double booking is refused by Postgres, and reports cover volume, crew load and
the reshoot rate.

Not built, deliberately: recurring shoots as a real recurrence rule (v1
generates the shoots up front), WhatsApp notifications, and Google Calendar
sync.
