import { one, query } from "../index.ts";
import { sha256 } from "../../crypto.ts";
import type { Locale, Role } from "../../types.ts";

export type SessionUser = {
  sessionId: string;
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  locale: Locale;
  timezone: string;
};

export async function insertSession(input: {
  userId: string;
  rawToken: string;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  await query(
    `insert into sessions (user_id, token_hash, expires_at, ip, user_agent)
     values ($1, $2, $3, $4, $5)`,
    [input.userId, sha256(input.rawToken), input.expiresAt, input.ip, input.userAgent],
  );
}

/**
 * Resolves a raw cookie token to its user, rejecting revoked or expired
 * sessions and users who have since been suspended - which is what makes
 * `setUserActive(false)` take effect on the next request rather than at the
 * next login.
 */
export async function resolveSession(rawToken: string): Promise<SessionUser | null> {
  return one<SessionUser>(
    `select s.id        as "sessionId",
            u.id        as "userId",
            u.email,
            u.full_name as "fullName",
            u.role,
            u.locale,
            u.timezone
       from sessions s
       join users u on u.id = s.user_id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
        and u.active`,
    [sha256(rawToken)],
  );
}

/** Cheap liveness bump; never awaited on the hot path. */
export async function touchSession(sessionId: string): Promise<void> {
  await query("update sessions set last_seen_at = now() where id = $1", [sessionId]);
}

export async function revokeSession(rawToken: string): Promise<void> {
  await query("update sessions set revoked_at = now() where token_hash = $1", [sha256(rawToken)]);
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await query(
    "update sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
    [userId],
  );
}

/** Housekeeping, run by the worker. */
export async function pruneExpiredSessions(): Promise<number> {
  const rows = await query<{ id: string }>(
    "delete from sessions where expires_at < now() - interval '30 days' returning id",
  );
  return rows.length;
}

// ---------------------------------------------------------------------------
// Login throttling
// ---------------------------------------------------------------------------

export async function recordLoginAttempt(
  key: string,
  success: boolean,
  ip: string | null,
): Promise<void> {
  await query("insert into login_attempts (key, success, ip) values ($1, $2, $3)", [
    key,
    success,
    ip,
  ]);
}

/**
 * Failures for a key inside the window. The lockout policy itself stays in
 * code (lib/auth/session.ts) so it can be reasoned about and changed without
 * a migration.
 */
export async function recentFailures(key: string, withinMinutes: number): Promise<number> {
  const row = await one<{ count: string }>(
    `select count(*)::text as count
       from login_attempts
      where key = $1
        and success = false
        and at > now() - ($2 || ' minutes')::interval`,
    [key, String(withinMinutes)],
  );
  return Number(row?.count ?? 0);
}

export async function clearFailures(key: string): Promise<void> {
  await query("delete from login_attempts where key = $1 and success = false", [key]);
}

export async function pruneLoginAttempts(): Promise<number> {
  const rows = await query<{ id: string }>(
    "delete from login_attempts where at < now() - interval '7 days' returning id",
  );
  return rows.length;
}
