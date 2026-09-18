# Deploying HUE Studio

Three ways to run this, in the order you are most likely to want them.

| Path | Buy a VPS | Administer a server | Database | Queue driver |
|---|---|---|---|---|
| **[Hostinger Web Apps + Neon](#alternative-hostinger-web-apps--neon)** | no | no | Neon | Hostinger cron |
| [Vercel + Neon](#alternative-vercel--neon) | no | no | Neon | external pinger |
| [VPS with Docker](#1-prepare-the-box) *(below)* | yes | yes | in the stack | the worker process |

Whichever you pick, one thing does not change: **the database must be
PostgreSQL.** What makes double booking impossible here is a Postgres
exclusion constraint over a time range, and nothing in MySQL does that job.

The VPS is what the system was built for — it runs the real worker process,
takes its own nightly backups, and has no platform limits. The other two trade
those for having no server to look after.

---

## What you need before starting

| Thing | Why |
|---|---|
| A Hostinger **VPS** (KVM, Ubuntu) | Shared hosting cannot run Next.js — it is PHP only. This was confirmed the hard way on an earlier project. |
| A **domain or subdomain** pointed at the VPS IP | Caddy issues the certificate against it, so the DNS A record must resolve *before* the first `docker compose up`. |
| A **GitHub repository** | The pipeline deploys from `main`. |

DNS: one **A record** for the host (e.g. `studio` → `203.0.113.10`). Give it a
few minutes to propagate before the first start, or Caddy's first certificate
attempt fails and retries on a backoff.

---

## 1. Prepare the box

```bash
ssh root@YOUR_VPS_IP

# Docker, once.
curl -fsSL https://get.docker.com | sh

# A user that is not root to run the app.
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh

# Only 22, 80 and 443 reach the internet. Postgres is never published at all -
# it is reachable only from the other containers.
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 2. Clone and configure

```bash
su - deploy
git clone https://github.com/tahaesmail92/hue-studio.git /home/deploy/hue-studio
cd /home/deploy/hue-studio
cp .env.example .env
nano .env
```

Fill in:

```ini
POSTGRES_PASSWORD=<a long random string>
APP_DOMAIN=studio.huecreative.agency
APP_URL=https://studio.huecreative.agency
RESEND_API_KEY=<from resend.com>
EMAIL_FROM=HUE Studio <studio@huecreative.agency>
ADMIN_EMAIL=you@huecreative.agency
DEFAULT_TIMEZONE=Africa/Cairo
DEFAULT_LOCALE=ar
```

`APP_URL` is what goes into every invite and confirmation link, so it must be
the real public URL — a wrong value here sends clients to a dead address.

> **Write secrets with an editor or `scp`, not by pasting into a web console.**
> Pasting long keys in a right-to-left environment has silently corrupted them
> before: a 200-character key arrived as eight valid characters and garbage.

Generate the database password on the box rather than inventing one:

```bash
openssl rand -base64 33
```

## 3. First start

```bash
docker compose up -d --build
docker compose run --rm web node db/migrate.mjs
docker compose run --rm web node db/seed.mjs you@huecreative.agency "Your Name"
```

The seed prints an **invite link**. Open it and choose a password — no password
is ever generated or emailed, for you or for anyone else.

Check it came up:

```bash
docker compose ps           # every service "running", web "healthy"
curl -I https://YOUR_DOMAIN # 200, and a valid certificate
```

## 4. Push to deploy

In the GitHub repository, under **Settings → Secrets and variables → Actions**,
add four repository secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | the VPS IP |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | the **private** key whose public half is in `deploy`'s `authorized_keys` |
| `VPS_APP_DIR` | `/home/deploy/hue-studio` |

Then, under **Variables**, add `DEPLOY_ENABLED` = `true`.

That switch is a variable rather than a secret on purpose: a job-level `if`
cannot read secrets, so without it every push made before the VPS existed would
end in a red cross for a deploy that was never configured. Tests still run on
every push either way.

After that, every push to `main` runs the tests, the linter and a production
build, and only then touches the box. The deploy builds, migrates, restarts,
and waits on the container's own healthcheck — if the app does not come back,
the run fails loudly with the last 80 log lines rather than going quiet.

---

## Alternative: Hostinger Web Apps + Neon

No server to administer and no VPS to buy. Hostinger runs `next build` then
`next start`; the database lives in Neon; a Hostinger cron drives the queue.

**Hostinger hosts MySQL only** — PostgreSQL is not offered on its managed
plans, and MySQL is not a substitute here. The constraint that makes
double-booking impossible is a Postgres exclusion constraint over a time
range, and MySQL has no equivalent. Replacing it would mean rewriting every
migration and every query to end up with a weaker guarantee enforced in
application code. So the database stays external; Hostinger supports exactly
that, and has a connect wizard for it.

### 1. A database, in the Neon project you already have

One Neon project holds many databases, so this needs no new account, no new
project, and runs into no plan limit: in the Neon console, **New Database**,
name it `hue_studio`.

Take the **pooled** connection string — the host ending `-pooler`.

Do not reuse the connection string another app is using. Pointing this one at
it would create these tables inside that app's live database.

### 2. Migrate and seed

From your laptop, with `DATABASE_URL` in `.env` pointing at the new database:

```bash
npm run db:migrate
npm run db:seed -- you@huecreative.agency "Your Name"
```

The seed prints an invite link. Open it and choose a password.

### 3. Deploy

Import the repository in hPanel → **Web Apps**, framework preset **Next.js**,
branch `main`. It runs `npm run build` and then `npm start`, which is why
`output: "standalone"` is gated behind `DOCKER_BUILD` — standalone is for the
Docker image and would leave Hostinger with no server to start.

Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon **pooled** string |
| `APP_URL` | the real public URL — it goes into every invite and confirmation link |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `EMAIL_FROM` · `ADMIN_EMAIL` | as elsewhere |
| `RESEND_API_KEY` | optional — without it sends are logged `skipped` and nothing breaks |
| `DEFAULT_TIMEZONE` · `DEFAULT_LOCALE` | `Africa/Cairo` · `ar` |

**Test this first, before anything else:** open `/api/health`.

- `{"ok":true}` — Node is running and the database is reachable. Done.
- `{"ok":false}` — Node is running, the database is not. It is `DATABASE_URL`.
- A 404 or a plain HTML page — the plan is not running Next as a server at
  all, and no amount of configuration will fix that. Stop here.

That last case is what happens on PHP-only shared hosting, and it has cost a
day before. It is a thirty-second check.

### 4. Drive the queue

There is no worker process, and **every email in this system is queued** — so
without this step invite emails never leave and nobody can activate an
account.

In hPanel → **Cron Jobs**, add a *custom* command every 5 minutes:

```bash
curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR_DOMAIN/api/cron/tick
```

Without that header the route answers **404**, not 401 — it does not confirm
it exists to anyone who has not got the secret.

Five minutes is fine for invitations and confirmations. It also sets how late
a reminder can be: an offset of 24 hours fires within five minutes of that
mark, which does not matter for a shoot tomorrow morning.

### What this path gives up

- **No nightly `pg_dump`.** Neon keeps its own history, on its own terms.
- **Reminders are only as punctual as the cron interval.**
- Scaling is whatever the hosting plan allows, rather than a box you control.

---

## Alternative: Vercel + Neon

No server to run, at the cost of one real compromise: **there is no worker
process.** Every email in this system is queued and sent by the worker, so
without something driving the queue, invite emails never leave — and nobody
can activate an account. `/api/cron/tick` is that driver: one turn of the
worker loop, over HTTP.

### 1. A database of its own

Create a **new database** in Neon — not the one hue-systems uses. Pointing
this app at that connection string would create its tables inside a live
production database.

Use the **pooled** connection string (the host ending `-pooler`): serverless
functions open a connection per instance, and the direct endpoint runs out.

### 2. Import and configure

Import `tahaesmail92/hue-studio` in Vercel, then set the environment
variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon **pooled** string |
| `APP_URL` | the deployment URL — this goes into every invite and confirmation link |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `EMAIL_FROM` · `ADMIN_EMAIL` | as on the VPS |
| `RESEND_API_KEY` | optional — without it, sends are logged as `skipped` and nothing breaks |
| `DEFAULT_TIMEZONE` · `DEFAULT_LOCALE` | `Africa/Cairo` · `ar` |

### 3. Migrate and seed

From your laptop, with `DATABASE_URL` pointing at the Neon database:

```bash
npm run db:migrate
npm run db:seed -- you@huecreative.agency "Your Name"
```

The seed prints the invite link. Open it and choose a password.

### 4. Drive the queue

`vercel.json` schedules the tick **daily**, because that is the only
frequency every Vercel plan accepts — a sub-daily schedule is rejected on the
free plan and fails the deploy outright. Once a day is far too slow for a
queue that carries invite emails.

So for anything beyond a look around, point a free external pinger
(cron-job.org and similar) at it every minute:

```
GET https://YOUR-APP.vercel.app/api/cron/tick
Authorization: Bearer <CRON_SECRET>
```

Without the header the route answers **404**, not 401 — it does not confirm it
exists to anyone who has not got the secret.

### What this path gives up

- **Reminders are only as punctual as the pinger.** The VPS worker ticks every
  minute by itself.
- **No nightly `pg_dump`.** Neon has its own history, on its own terms.
- Long PDF renders and the queue share a function's duration limit, where the
  VPS has neither constraint.

It is a good way to see the system working. The VPS is what it was built for.

---

## Backups

`docker/backup.sh` runs as its own container and takes a nightly `pg_dump`
with 14-day retention into the `backups` volume.

**Copying those dumps off the box is a separate, deliberate step.** A backup
that only exists on the machine it protects is not a backup. From your laptop:

```bash
ssh deploy@YOUR_VPS_IP 'docker run --rm -v hue-studio_backups:/b alpine tar -cz -C /b .' \
  > "hue-studio-backups-$(date +%F).tar.gz"
```

Restoring:

```bash
gunzip -c dump.sql.gz | docker compose exec -T postgres psql -U hue -d hue_studio
```

## Day-to-day

```bash
docker compose logs -f web         # or worker
docker compose restart worker
docker compose run --rm web node db/seed.mjs someone@example.com "Name"   # reissue an invite
```

If someone is locked out, re-running the seed with their email reissues an
invite rather than creating a duplicate account.

## When something is wrong

**The certificate never issues.** The A record is not resolving yet, or port 80
is closed. Caddy needs 80 reachable to answer the ACME challenge:
`docker compose logs caddy`.

**`web` is unhealthy.** Almost always `DATABASE_URL` or a migration:
`docker compose logs web`. The compose file builds `DATABASE_URL` from
`POSTGRES_PASSWORD`, so a password with characters that need URL-encoding is
worth ruling out — `openssl rand -base64` output is safe.

**Emails are not arriving.** Without `RESEND_API_KEY` the app records every
send in `email_log` as `skipped` and carries on by design. Check there first:

```bash
docker compose exec postgres psql -U hue -d hue_studio \
  -c "select to_email, template, status, error, created_at from email_log order by created_at desc limit 20;"
```

**Reminders are not going out.** They are the worker's job, not the web app's:
`docker compose logs worker`. A reminder is claimed in `shoot_reminders` before
it is sent, so a row there means it already went.
