# Deploying HUE Studio

One Hostinger VPS, five containers, and a push-to-deploy pipeline. Caddy gets
TLS certificates by itself; nothing needs a control panel after the first run.

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
git clone https://github.com/YOUR_USER/hue-studio.git /home/deploy/hue-studio
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

After that, every push to `main` runs the tests, the linter and a production
build, and only then touches the box. The deploy builds, migrates, restarts,
and waits on the container's own healthcheck — if the app does not come back,
the run fails loudly with the last 80 log lines rather than going quiet.

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
