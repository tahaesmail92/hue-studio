import { one, query, tx } from "../index.ts";
import { randomToken, sha256 } from "../../crypto.ts";
import { env } from "../../env.ts";
import type { Locale, Role } from "../../types.ts";

export type InviteKind = "invite" | "reset";

/**
 * The raw token is returned exactly once, to be put in the email, and is never
 * stored. Only its hash reaches the database, so a dump cannot be turned into
 * account takeovers.
 */
export type IssuedInvite = {
  rawToken: string;
  url: string;
  expiresAt: Date;
};

/**
 * Issues a fresh link, superseding any live one for the same user and kind.
 * Reissuing is the fix for "the email went to spam", so it must be safe to do
 * repeatedly - the previous token stops working the moment this one exists.
 */
export async function issueInvite(input: {
  userId: string;
  kind: InviteKind;
  createdBy: string | null;
}): Promise<IssuedInvite> {
  const rawToken = randomToken(32);
  const expiresAt = new Date(Date.now() + env.inviteTtlDays * 86_400_000);

  await tx(async (client) => {
    // `invites_one_live` allows a single unaccepted row per user and kind, so
    // the old one is retired rather than left to collide.
    await client.query(
      `delete from invites
        where user_id = $1 and kind = $2 and accepted_at is null`,
      [input.userId, input.kind],
    );
    await client.query(
      `insert into invites (user_id, kind, token_hash, expires_at, created_by)
       values ($1, $2, $3, $4, $5)`,
      [input.userId, input.kind, sha256(rawToken), expiresAt, input.createdBy],
    );
  });

  const path = input.kind === "invite" ? "invite" : "reset";
  return {
    rawToken,
    url: `${env.appUrl}/${path}/${encodeURIComponent(rawToken)}`,
    expiresAt,
  };
}

export type InviteTarget = {
  inviteId: string;
  userId: string;
  kind: InviteKind;
  email: string;
  fullName: string;
  role: Role;
  locale: Locale;
  expired: boolean;
};

/**
 * Looks a raw token up without consuming it, so the "set your password" page
 * can be rendered before anything is committed.
 *
 * An expired row is returned rather than hidden: "this link has expired, ask
 * for a new one" is a far more useful answer than "invalid link".
 */
export async function findInvite(rawToken: string): Promise<InviteTarget | null> {
  return one<InviteTarget>(
    `select i.id                      as "inviteId",
            u.id                      as "userId",
            i.kind,
            u.email,
            u.full_name               as "fullName",
            u.role,
            u.locale,
            (i.expires_at <= now())   as expired
       from invites i
       join users u on u.id = i.user_id
      where i.token_hash = $1
        and i.accepted_at is null
        and u.active`,
    [sha256(rawToken)],
  );
}

/**
 * Consumes the invite and sets the password in one transaction, and revokes
 * every existing session for that user: after a reset, any stolen session is
 * dead too, which is half the point of resetting.
 *
 * Returns false when the token was consumed by a parallel request - the update
 * is conditional on accepted_at still being null, so only one caller wins.
 */
export async function acceptInvite(input: {
  inviteId: string;
  userId: string;
  passwordHash: string;
}): Promise<boolean> {
  return tx(async (client) => {
    const claimed = await client.query(
      `update invites set accepted_at = now()
        where id = $1 and accepted_at is null and expires_at > now()
        returning id`,
      [input.inviteId],
    );
    if (claimed.rowCount === 0) return false;

    await client.query("update users set password_hash = $2 where id = $1", [
      input.userId,
      input.passwordHash,
    ]);
    await client.query(
      "update sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
      [input.userId],
    );
    return true;
  });
}

/** Shown on the client and crew pages: "invited, not activated yet". */
export async function pendingInviteFor(userId: string): Promise<{ expiresAt: Date } | null> {
  return one<{ expiresAt: Date }>(
    `select expires_at as "expiresAt"
       from invites
      where user_id = $1 and kind = 'invite' and accepted_at is null`,
    [userId],
  );
}

export async function prunePastInvites(): Promise<number> {
  const rows = await query<{ id: string }>(
    `delete from invites
      where expires_at < now() - interval '30 days'
         or accepted_at < now() - interval '30 days'
      returning id`,
  );
  return rows.length;
}
