import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomToken } from "../crypto.ts";
import { env } from "../env.ts";
import { LOCALE_COOKIE } from "../i18n/index.ts";
import {
  insertSession,
  resolveSession,
  revokeSession,
  type SessionUser,
} from "../db/repo/sessions.ts";
import { clientIdsForUser, resourceIdForUser } from "../db/repo/users.ts";
import { ForbiddenError, isStaff, type Ctx, type Role } from "../types.ts";

/** Behind Caddy the real client address arrives in X-Forwarded-For. */
export async function clientIp(): Promise<string | null> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * Issues a session and plants the cookie. Server Actions and Route Handlers
 * only - a Server Component cannot write cookies.
 *
 * The locale cookie is set from the user's stored preference at the same
 * moment, so the first page after login is already in their language.
 */
export async function startSession(userId: string, locale: "ar" | "en"): Promise<void> {
  const rawToken = randomToken(32);
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 86_400_000);

  const headerList = await headers();
  await insertSession({
    userId,
    rawToken,
    expiresAt,
    ip: await clientIp(),
    userAgent: headerList.get("user-agent"),
  });

  const jar = await cookies();
  jar.set(env.sessionCookieName, rawToken, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  jar.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 86_400,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const rawToken = jar.get(env.sessionCookieName)?.value;
  if (rawToken) await revokeSession(rawToken);
  jar.delete(env.sessionCookieName);
}

/** The signed-in user, or null. Never redirects - use requireUser for that. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const rawToken = jar.get(env.sessionCookieName)?.value;
  if (!rawToken) return null;
  return resolveSession(rawToken);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Builds the authorization context once per request. The extra lookups are
 * only made for the roles that need them: staff see everything, so there is
 * nothing to look up.
 */
export async function requireCtx(): Promise<{ user: SessionUser; ctx: Ctx }> {
  const user = await requireUser();
  const allClients = isStaff(user.role);

  const ctx: Ctx = {
    userId: user.userId,
    role: user.role,
    allClients,
    clientIds: user.role === "client" ? await clientIdsForUser(user.userId) : [],
    resourceId: user.role === "crew" ? await resourceIdForUser(user.userId) : null,
  };
  return { user, ctx };
}

/**
 * For Server Actions and Route Handlers: refusing loudly is correct when
 * something is being *done*.
 */
export async function requireRole(...roles: Role[]): Promise<{ user: SessionUser; ctx: Ctx }> {
  const result = await requireCtx();
  if (!roles.includes(result.user.role)) {
    throw new ForbiddenError("Your role does not allow this.");
  }
  return result;
}

/**
 * For pages: a producer following a stale bookmark to /portal has not done
 * anything wrong, so they are sent to their own home rather than shown a
 * server error. Only navigation uses this - actions still throw.
 */
export async function requirePageRole(
  ...roles: Role[]
): Promise<{ user: SessionUser; ctx: Ctx }> {
  const result = await requireCtx();
  if (!roles.includes(result.user.role)) redirect(homeFor(result.user.role));
  return result;
}

/** Admin or producer. The guard on every agency-side route group. */
export async function requireStaff(): Promise<{ user: SessionUser; ctx: Ctx }> {
  return requireRole("admin", "producer");
}

/** Where a user belongs after signing in. */
export function homeFor(role: Role): string {
  if (role === "client") return "/portal";
  if (role === "crew") return "/crew";
  return "/";
}

// ---------------------------------------------------------------------------
// Login throttling policy
//
// Kept in code rather than the database so it can be read and changed without
// a migration. Ten failures in fifteen minutes is generous for a human and
// ruinous for a script.
// ---------------------------------------------------------------------------
export const LOCKOUT = { maxFailures: 10, windowMinutes: 15 };
