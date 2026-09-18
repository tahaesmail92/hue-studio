"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getT } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/auth/session";
import {
  NotAllowed,
  deleteClientForever,
  deletePersonForever,
  impactOfDeletingClient,
  impactOfDeletingPerson,
} from "@/lib/db/repo/purge";
import type { FormState } from "./state";

/**
 * The two actions that destroy rather than record.
 *
 * Both require the exact name to be typed. That is not decoration: these are
 * the only operations in the system with no undo and no internal copy, and a
 * plain confirm dialog is too easy to dismiss by reflex.
 */

function typedName(formData: FormData): string {
  const value = formData.get("confirmName");
  return typeof value === "string" ? value.trim() : "";
}

export async function deleteClientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireCtx();
  const { t } = await getT();

  const id = formData.get("id");
  if (typeof id !== "string") return { error: t.errors.notFound };

  try {
    const impact = await impactOfDeletingClient(ctx, id);
    if (!impact) return { error: t.errors.notFound };

    // Compared against the name as it stands right now, not a value carried in
    // the form, so a stale page cannot authorise deleting a renamed client.
    if (typedName(formData) !== impact.clientName) {
      return { error: t.danger.nameMismatch };
    }

    await deleteClientForever(ctx, id);
  } catch (err) {
    if (err instanceof NotAllowed) return { error: t.danger.adminOnly };
    throw err;
  }

  revalidatePath("/clients");
  redirect("/clients");
}

export async function deletePersonAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireCtx();
  const { t } = await getT();

  const userId = formData.get("userId");
  if (typeof userId !== "string") return { error: t.errors.notFound };

  try {
    const impact = await impactOfDeletingPerson(ctx, userId);
    if (!impact) return { error: t.errors.notFound };
    if (typedName(formData) !== impact.fullName) {
      return { error: t.danger.nameMismatch };
    }

    await deletePersonForever(ctx, userId);
  } catch (err) {
    if (err instanceof NotAllowed) {
      // Say which refusal it was - "not allowed" on its own leaves someone
      // guessing whether it is their role or the record.
      const reason = err.message.includes("last administrator")
        ? t.danger.lastAdmin
        : err.message.includes("your own account")
          ? t.danger.notYourself
          : t.danger.adminOnly;
      return { error: reason };
    }
    throw err;
  }

  revalidatePath("/crew-members");
  revalidatePath("/clients");
  return { ok: t.danger.deleted };
}
