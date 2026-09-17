import { one, query } from "../index.ts";
import type { ClientStatus, Ctx } from "../../types.ts";
import { assertClientAccess, assertStaff } from "../../types.ts";

export type Client = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  sector: string | null;
  timezone: string;
  notes: string | null;
  status: ClientStatus;
  createdAt: Date;
};

const COLUMNS = `id, name, slug, logo_url as "logoUrl", sector, timezone,
                 notes, status, created_at as "createdAt"`;

/**
 * Scoped by ctx, always. A client user gets their own companies and nothing
 * else - which is the whole promise the portal makes.
 */
export async function listClients(ctx: Ctx, includeArchived = false): Promise<Client[]> {
  if (ctx.allClients) {
    return query<Client>(
      `select ${COLUMNS} from clients
        where ($1 or status <> 'archived')
        order by status, name`,
      [includeArchived],
    );
  }
  if (ctx.clientIds.length === 0) return [];
  return query<Client>(
    `select ${COLUMNS} from clients where id = any($1) order by name`,
    [ctx.clientIds],
  );
}

export async function getClient(ctx: Ctx, id: string): Promise<Client | null> {
  assertClientAccess(ctx, id);
  return one<Client>(`select ${COLUMNS} from clients where id = $1`, [id]);
}

/** Slugs are derived, not typed: one less thing for a producer to get wrong. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    // Keep Arabic letters: a company named only in Arabic still needs a slug.
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return base || `client-${Date.now().toString(36)}`;
}

export async function createClient(
  ctx: Ctx,
  input: { name: string; sector?: string | null; timezone?: string; notes?: string | null },
): Promise<Client> {
  assertStaff(ctx);

  // Two clients may legitimately share a name; the slug disambiguates rather
  // than refusing the second one.
  const base = slugify(input.name);
  const taken = await query<{ slug: string }>(
    "select slug from clients where slug = $1 or slug like $2",
    [base, `${base}-%`],
  );
  const slug = taken.length === 0 ? base : `${base}-${taken.length + 1}`;

  const row = await one<Client>(
    `insert into clients (name, slug, sector, timezone, notes)
     values ($1, $2, $3, coalesce($4, 'Africa/Cairo'), $5)
     returning ${COLUMNS}`,
    [input.name.trim(), slug, input.sector ?? null, input.timezone ?? null, input.notes ?? null],
  );
  return row!;
}

export async function updateClient(
  ctx: Ctx,
  id: string,
  patch: {
    name?: string;
    sector?: string | null;
    timezone?: string;
    notes?: string | null;
    status?: ClientStatus;
    logoUrl?: string | null;
  },
): Promise<void> {
  assertStaff(ctx);
  await query(
    `update clients set
       name     = coalesce($2, name),
       sector   = coalesce($3, sector),
       timezone = coalesce($4, timezone),
       notes    = coalesce($5, notes),
       status   = coalesce($6, status),
       logo_url = coalesce($7, logo_url)
     where id = $1`,
    [
      id,
      patch.name ?? null,
      patch.sector ?? null,
      patch.timezone ?? null,
      patch.notes ?? null,
      patch.status ?? null,
      patch.logoUrl ?? null,
    ],
  );
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export type ClientContact = {
  userId: string;
  email: string;
  fullName: string;
  active: boolean;
  activated: boolean;
  lastLoginAt: Date | null;
  inviteExpiresAt: Date | null;
};

/**
 * The people at a client who can sign in, with enough state to tell the three
 * cases apart in the UI: invited and waiting, activated, or suspended.
 */
export async function clientContacts(ctx: Ctx, clientId: string): Promise<ClientContact[]> {
  assertClientAccess(ctx, clientId);
  return query<ClientContact>(
    `select u.id                     as "userId",
            u.email,
            u.full_name              as "fullName",
            u.active,
            (u.password_hash is not null) as activated,
            u.last_login_at          as "lastLoginAt",
            i.expires_at             as "inviteExpiresAt"
       from client_members m
       join users u on u.id = m.user_id
       left join invites i
              on i.user_id = u.id and i.kind = 'invite' and i.accepted_at is null
      where m.client_id = $1
      order by u.full_name`,
    [clientId],
  );
}

export async function addContact(ctx: Ctx, clientId: string, userId: string): Promise<void> {
  assertStaff(ctx);
  await query(
    `insert into client_members (user_id, client_id) values ($1, $2)
     on conflict do nothing`,
    [userId, clientId],
  );
}

// ---------------------------------------------------------------------------
// The visit counter (spec section 8)
//
// Derived on read, never stored. A counter column drifts the first time a
// shoot is cancelled or moved between years, and then nobody trusts any of the
// numbers.
// ---------------------------------------------------------------------------

export type VisitCounts = { today: number; week: number; month: number; year: number };

/**
 * Counted against the CLIENT's own timezone, so "this month" means the month
 * they are living in, and only shoots that actually happened are counted -
 * cancelled and rejected ones never took place.
 */
export async function visitCounts(ctx: Ctx, clientId: string): Promise<VisitCounts> {
  assertClientAccess(ctx, clientId);
  const row = await one<{ today: string; week: string; month: string; year: string }>(
    `with local as (
       select (s.starts_at at time zone c.timezone)::date as day
         from shoots s
         join clients c on c.id = s.client_id
        where s.client_id = $1
          and s.starts_at is not null
          and s.status in ('confirmed', 'in_progress', 'completed', 'delivered')
     ),
     today as (select (now() at time zone (select timezone from clients where id = $1))::date as d)
     select count(*) filter (where day = (select d from today))::text as today,
            -- Weeks start on Sunday here, which is how the calendar reads in
            -- Cairo and Riyadh; date_trunc('week') would start on Monday.
            count(*) filter (
              where day >= (select d - extract(dow from d)::int from today)
                and day <  (select d - extract(dow from d)::int + 7 from today)
            )::text as week,
            count(*) filter (where date_trunc('month', day) =
                             date_trunc('month', (select d from today)))::text as month,
            count(*) filter (where date_trunc('year', day) =
                             date_trunc('year', (select d from today)))::text as year
       from local`,
    [clientId],
  );
  return {
    today: Number(row?.today ?? 0),
    week: Number(row?.week ?? 0),
    month: Number(row?.month ?? 0),
    year: Number(row?.year ?? 0),
  };
}

/** Shoots per year, for the client file's history strip. */
export async function visitsByYear(
  ctx: Ctx,
  clientId: string,
): Promise<{ year: number; count: number }[]> {
  assertClientAccess(ctx, clientId);
  const rows = await query<{ year: string; count: string }>(
    `select extract(year from s.starts_at at time zone c.timezone)::text as year,
            count(*)::text as count
       from shoots s
       join clients c on c.id = s.client_id
      where s.client_id = $1
        and s.starts_at is not null
        and s.status in ('confirmed', 'in_progress', 'completed', 'delivered')
      group by 1 order by 1 desc`,
    [clientId],
  );
  return rows.map((r) => ({ year: Number(r.year), count: Number(r.count) }));
}
