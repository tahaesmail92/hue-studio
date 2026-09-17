"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getT } from "@/lib/i18n";
import { checkPasswordPolicy, hashPassword } from "@/lib/auth/password";
import { homeFor, startSession } from "@/lib/auth/session";
import { acceptInvite, findInvite, issueInvite } from "@/lib/db/repo/invites";
import { findByEmail } from "@/lib/db/repo/users";
import { getSettings } from "@/lib/db/repo/settings";
import { sendEmail } from "@/lib/mail/send";
import { resetEmail } from "@/lib/mail/templates";
import type { FormState } from "./state";

// ---------------------------------------------------------------------------
// Accepting an invite or a reset. Both links land here: the only difference
// between them is the wording of the email that carried the token.
// ---------------------------------------------------------------------------

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string(),
  confirm: z.string(),
});

export async function setPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { t } = await getT();

  const parsed = acceptSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: t.auth.inviteInvalid };

  const { token, password, confirm } = parsed.data;
  if (password !== confirm) return { error: t.auth.passwordsDoNotMatch };

  const problem = checkPasswordPolicy(password);
  if (problem) return { error: t.auth[problem] };

  const invite = await findInvite(token);
  if (!invite) return { error: t.auth.inviteInvalid };
  if (invite.expired) return { error: t.auth.inviteExpired };

  const accepted = await acceptInvite({
    inviteId: invite.inviteId,
    userId: invite.userId,
    passwordHash: await hashPassword(password),
  });
  // Lost the race against another tab that used the same link first.
  if (!accepted) return { error: t.auth.inviteInvalid };

  // Straight in, rather than back to the login form to type what they just
  // chose. acceptInvite revoked every older session, so this is the only one.
  await startSession(invite.userId, invite.locale);
  redirect(homeFor(invite.role));
}

// ---------------------------------------------------------------------------
// Requesting a reset
// ---------------------------------------------------------------------------

const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function requestResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { t } = await getT();

  const settings = await getSettings();
  if (!settings.allowSelfReset) return { error: t.auth.selfResetDisabled };

  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  // The same reassuring answer either way: whether an address is registered
  // is not something a stranger gets to find out.
  if (!parsed.success) return { ok: t.auth.resetSent };

  const user = await findByEmail(parsed.data.email);

  // A dormant account is skipped deliberately - it already has a live invite,
  // and issuing a reset alongside it would leave two links in flight.
  if (user && user.active && user.activated) {
    const invite = await issueInvite({ userId: user.id, kind: "reset", createdBy: null });
    await sendEmail(
      resetEmail({
        to: user.email,
        fullName: user.fullName,
        url: invite.url,
        locale: user.locale,
      }),
    );
  }

  return { ok: t.auth.resetSent };
}
