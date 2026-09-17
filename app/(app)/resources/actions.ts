"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getT } from "@/lib/i18n/server";
import { requireStaff } from "@/lib/auth/session";
import { createResource, retireResource, updateResource } from "@/lib/db/repo/resources";
import { createUser } from "@/lib/db/repo/users";
import { sendInvite } from "../clients/actions";
import type { FormState } from "../state";

const KINDS = ["person", "studio", "equipment"] as const;
const CRAFTS = ["photographer", "videographer", "editor"] as const;

export async function createResourceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const kind = formData.get("kind");
  const name = formData.get("name");
  const craft = formData.get("craft");

  if (typeof name !== "string" || name.trim() === "") return { error: t.common.required };
  if (!KINDS.includes(kind as (typeof KINDS)[number])) return { error: t.common.required };

  await createResource(ctx, {
    kind: kind as (typeof KINDS)[number],
    name,
    craft: CRAFTS.includes(craft as (typeof CRAFTS)[number])
      ? (craft as (typeof CRAFTS)[number])
      : null,
    notes: typeof formData.get("notes") === "string" ? String(formData.get("notes")) : null,
  });

  revalidatePath("/resources");
  return { ok: t.common.saved };
}

export async function retireResourceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const id = formData.get("id");
  if (typeof id !== "string") return { error: t.errors.notFound };

  // Retired, never deleted: every shoot it was booked on still points at it.
  await retireResource(ctx, id);
  revalidatePath("/resources");
  return { ok: t.common.saved };
}

export async function reactivateResourceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const id = formData.get("id");
  if (typeof id !== "string") return { error: t.errors.notFound };

  await updateResource(ctx, id, { active: true });
  revalidatePath("/resources");
  return { ok: t.common.saved };
}

/**
 * A crew member is a login and a bookable resource at once - createUser makes
 * both in one transaction. Someone who can be booked but cannot sign in, or
 * the reverse, is a half-made record that causes confusion later.
 */
export async function createCrewAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const email = formData.get("email");
  const fullName = formData.get("fullName");
  const craft = formData.get("craft");

  if (typeof email !== "string" || typeof fullName !== "string") {
    return { error: t.common.required };
  }
  if (!z.string().email().safeParse(email.trim()).success) return { error: t.common.required };

  try {
    const user = await createUser(ctx, {
      email: email.trim(),
      fullName: fullName.trim(),
      role: "crew",
      craft: CRAFTS.includes(craft as (typeof CRAFTS)[number])
        ? (craft as (typeof CRAFTS)[number])
        : null,
    });
    await sendInvite(user.id, user.email, user.fullName, user.locale, ctx.userId);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return { error: t.errors.emailTaken };
    throw err;
  }

  revalidatePath("/crew-members");
  revalidatePath("/resources");
  return { ok: t.client.inviteSent };
}
