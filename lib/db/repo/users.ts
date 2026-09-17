import { one, query, tx } from "../index.ts";
import type { Craft, Ctx, Locale, Role } from "../../types.ts";
import { assertStaff, ForbiddenError } from "../../types.ts";

export type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  locale: Locale;
  timezone: string;
  phone: string | null;
  /** Null means the invite has not been accepted: the account is dormant. */
  password_hash: string | null;
  last_login_at: Date | null;
  created_at: Date;
};

export type User = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  active: boolean;
  locale: Locale;
  timezone: string;
  phone: string | null;
  /** False until an invite is accepted. The UI shows this as "not activated". */
  activated: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    active: row.active,
    locale: row.locale,
    timezone: row.timezone,
    phone: row.phone,
    activated: row.password_hash !== null,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

const COLUMNS = `id, email, full_name, role, active, locale, timezone, phone,
                 password_hash, last_login_at, created_at`;

// ---------------------------------------------------------------------------
// Reads used by the auth flow itself, before a Ctx exists.
// ---------------------------------------------------------------------------

export type LoginCandidate = {
  id: string;
  /** Null means the invite was never accepted: the account is dormant. */
  passwordHash: string | null;
  active: boolean;
  locale: Locale;
  /** Returned here so a successful login can redirect without a second read. */
  role: Role;
};

/** Login path only: this is the one place password_hash leaves the database. */
export async function findByEmailForLogin(email: string): Promise<LoginCandidate | null> {
  const row = await one<{
    id: string;
    password_hash: string | null;
    active: boolean;
    locale: Locale;
    role: Role;
  }>("select id, password_hash, active, locale, role from users where email = $1", [email]);
  if (!row) return null;
  return {
    id: row.id,
    passwordHash: row.password_hash,
    active: row.active,
    locale: row.locale,
    role: row.role,
  };
}

export async function findByEmail(email: string): Promise<User | null> {
  const row = await one<UserRow>(`select ${COLUMNS} from users where email = $1`, [email]);
  return row ? toUser(row) : null;
}

export async function markLogin(userId: string): Promise<void> {
  await query("update users set last_login_at = now() where id = $1", [userId]);
}

export async function setPassword(userId: string, passwordHash: string): Promise<void> {
  await query("update users set password_hash = $2 where id = $1", [userId, passwordHash]);
}

export async function setLocale(userId: string, locale: Locale): Promise<void> {
  await query("update users set locale = $2 where id = $1", [userId, locale]);
}

// ---------------------------------------------------------------------------
// Staff-facing management. Every one of these asserts first: authorization is
// the data layer's job, not the page's.
// ---------------------------------------------------------------------------

export async function listUsers(ctx: Ctx, role?: Role): Promise<User[]> {
  assertStaff(ctx);
  const rows = role
    ? await query<UserRow>(
        `select ${COLUMNS} from users where role = $1 order by full_name`,
        [role],
      )
    : await query<UserRow>(`select ${COLUMNS} from users order by role, full_name`);
  return rows.map(toUser);
}

export async function getUser(ctx: Ctx, id: string): Promise<User | null> {
  // Anyone may read their own record; only staff may read anyone else's.
  if (id !== ctx.userId) assertStaff(ctx);
  const row = await one<UserRow>(`select ${COLUMNS} from users where id = $1`, [id]);
  return row ? toUser(row) : null;
}

export type NewUser = {
  email: string;
  fullName: string;
  role: Role;
  locale?: Locale;
  timezone?: string;
  phone?: string | null;
  /** For a client user: the companies they may see. */
  clientIds?: string[];
  /** For a crew user: creates the matching person resource in one go. */
  craft?: Craft | null;
};

/**
 * Creates a dormant account. No password is generated and nothing is emailed
 * from here - the caller issues an invite, which is the only way in.
 *
 * A crew user and the `resources` row that represents them are created in one
 * transaction: a crew member who cannot be booked is not a crew member.
 */
export async function createUser(ctx: Ctx, input: NewUser): Promise<User> {
  assertStaff(ctx);
  if (input.role === "admin" && ctx.role !== "admin") {
    throw new ForbiddenError("Only an administrator can create another administrator.");
  }

  return tx(async (client) => {
    const inserted = await client.query<UserRow>(
      `insert into users (email, full_name, role, locale, timezone, phone)
       values ($1, $2, $3::user_role, coalesce($4::user_locale, 'ar'), coalesce($5, 'Africa/Cairo'), $6)
       returning ${COLUMNS}`,
      [
        input.email.trim(),
        input.fullName.trim(),
        input.role,
        input.locale ?? null,
        input.timezone ?? null,
        input.phone ?? null,
      ],
    );
    const user = inserted.rows[0];

    if (input.role === "client" && input.clientIds?.length) {
      for (const clientId of input.clientIds) {
        await client.query(
          `insert into client_members (user_id, client_id) values ($1, $2)
           on conflict do nothing`,
          [user.id, clientId],
        );
      }
    }

    if (input.role === "crew") {
      await client.query(
        `insert into resources (kind, name, user_id, craft) values ('person', $1, $2, $3)`,
        [user.full_name, user.id, input.craft ?? null],
      );
    }

    return toUser(user);
  });
}

export async function updateUser(
  ctx: Ctx,
  id: string,
  patch: { fullName?: string; phone?: string | null; timezone?: string; locale?: Locale },
): Promise<void> {
  if (id !== ctx.userId) assertStaff(ctx);
  await query(
    `update users set
       full_name = coalesce($2, full_name),
       phone     = coalesce($3, phone),
       timezone  = coalesce($4, timezone),
       locale    = coalesce($5, locale)
     where id = $1`,
    [id, patch.fullName ?? null, patch.phone ?? null, patch.timezone ?? null, patch.locale ?? null],
  );
}

/**
 * Suspending rather than deleting. Accounts are referenced by every shoot they
 * touched, and the history has to stay readable; revoking their sessions is
 * what actually locks them out.
 */
export async function setUserActive(ctx: Ctx, id: string, active: boolean): Promise<void> {
  assertStaff(ctx);
  if (id === ctx.userId) {
    throw new ForbiddenError("You cannot suspend your own account.");
  }
  await tx(async (client) => {
    await client.query("update users set active = $2 where id = $1", [id, active]);
    if (!active) {
      await client.query(
        "update sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
        [id],
      );
    }
  });
}

/** The companies a client user belongs to. Used to build the Ctx. */
export async function clientIdsForUser(userId: string): Promise<string[]> {
  const rows = await query<{ client_id: string }>(
    "select client_id from client_members where user_id = $1",
    [userId],
  );
  return rows.map((r) => r.client_id);
}

/** The resources row representing a crew user, if any. Used to build the Ctx. */
export async function resourceIdForUser(userId: string): Promise<string | null> {
  const row = await one<{ id: string }>("select id from resources where user_id = $1", [userId]);
  return row?.id ?? null;
}

/** Where "a new request arrived" goes when ADMIN_EMAIL is not set. */
export async function staffEmails(): Promise<string[]> {
  const rows = await query<{ email: string }>(
    "select email from users where role in ('admin', 'producer') and active",
  );
  return rows.map((r) => r.email);
}
