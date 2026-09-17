"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getT } from "@/lib/i18n/server";
import { requireStaff } from "@/lib/auth/session";
import { addContact, createClient, updateClient } from "@/lib/db/repo/clients";
import { createUser } from "@/lib/db/repo/users";
import { issueInvite } from "@/lib/db/repo/invites";
import { enqueue } from "@/lib/db/repo/jobs";
import { inviteEmail } from "@/lib/mail/templates";
import type { FormState } from "../state";

const clientSchema = z.object({
  name: z.string().trim().min(1),
  sector: z.string().trim().nullable(),
  timezone: z.string().trim().min(1),
  notes: z.string().trim().nullable(),
});

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function createClientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    sector: text(formData, "sector"),
    timezone: text(formData, "timezone") ?? "Africa/Cairo",
    notes: text(formData, "notes"),
  });
  if (!parsed.success) return { error: t.common.required };

  await createClient(ctx, parsed.data);
  revalidatePath("/clients");
  return { ok: t.common.saved };
}

export async function updateClientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const id = formData.get("id");
  if (typeof id !== "string") return { error: t.errors.notFound };

  const status = formData.get("status");
  await updateClient(ctx, id, {
    name: text(formData, "name") ?? undefined,
    sector: text(formData, "sector"),
    timezone: text(formData, "timezone") ?? undefined,
    notes: text(formData, "notes"),
    status:
      status === "active" || status === "paused" || status === "archived" ? status : undefined,
  });

  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
  return { ok: t.common.saved };
}

/**
 * Adds a contact at a client and sends them an invite in one step.
 *
 * The two halves are deliberately not separable in the UI: an account with no
 * invite is a dormant row nobody remembers to activate, and an invite with no
 * account cannot exist.
 */
export async function inviteContactAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const clientId = formData.get("clientId");
  const email = text(formData, "email");
  const fullName = text(formData, "fullName");
  if (typeof clientId !== "string" || !email || !fullName) {
    return { error: t.common.required };
  }
  if (!z.string().email().safeParse(email).success) return { error: t.common.required };

  try {
    const user = await createUser(ctx, {
      email,
      fullName,
      role: "client",
      clientIds: [clientId],
    });
    await sendInvite(user.id, user.email, user.fullName, user.locale, ctx.userId);
  } catch (err) {
    // 23505 is the unique violation on users.email.
    if ((err as { code?: string }).code === "23505") return { error: t.errors.emailTaken };
    throw err;
  }

  revalidatePath(`/clients/${clientId}`);
  return { ok: t.client.inviteSent };
}

/** Re-issuing is the fix for "it went to spam", so it must be safe to repeat. */
export async function resendInviteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const userId = formData.get("userId");
  const email = formData.get("email");
  const fullName = formData.get("fullName");
  if (typeof userId !== "string" || typeof email !== "string" || typeof fullName !== "string") {
    return { error: t.errors.notFound };
  }

  await sendInvite(userId, email, fullName, "ar", ctx.userId);
  revalidatePath("/clients");
  revalidatePath("/crew-members");
  return { ok: t.client.inviteSent };
}

export async function addExistingContactAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const clientId = formData.get("clientId");
  const userId = formData.get("userId");
  if (typeof clientId !== "string" || typeof userId !== "string") {
    return { error: t.errors.notFound };
  }

  await addContact(ctx, clientId, userId);
  revalidatePath(`/clients/${clientId}`);
  return { ok: t.common.saved };
}

/**
 * Shared by every "send them a way in" path. The email is queued rather than
 * sent inline so a slow provider never makes the producer wait.
 */
export async function sendInvite(
  userId: string,
  email: string,
  fullName: string,
  locale: "ar" | "en",
  createdBy: string,
): Promise<void> {
  const invite = await issueInvite({ userId, kind: "invite", createdBy });
  await enqueue({
    type: "send_email",
    payload: {
      ...inviteEmail({
        to: email,
        fullName,
        url: invite.url,
        locale,
        expiresAt: invite.expiresAt,
      }),
    },
  });
}
