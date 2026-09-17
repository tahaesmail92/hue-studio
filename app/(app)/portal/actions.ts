"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getT } from "@/lib/i18n/server";
import { requireRole } from "@/lib/auth/session";
import { createShoot, getShoot } from "@/lib/db/repo/shoots";
import { approveFinal } from "@/lib/db/repo/deliverables";
import { announceApproval, announceNewRequest } from "@/lib/announce";
import type { FormState } from "../state";

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function num(formData: FormData, key: string): number | null {
  const value = str(formData, key);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * A client submitting a request.
 *
 * Only the title is validated, because only the title is required. Everything
 * else is a proposal - the producer settles it at approval time, and refusing
 * a request for a missing camera count would just push the conversation back
 * to WhatsApp, which is the thing this system exists to stop.
 */
export async function submitRequestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireRole("client");
  const { t } = await getT();

  const title = str(formData, "title");
  if (!title) return { error: t.common.required };

  // The company is taken from the account, never from the form: a client
  // cannot file a request against someone else's name.
  const clientId = str(formData, "clientId") ?? ctx.clientIds[0];
  if (!clientId || !ctx.clientIds.includes(clientId)) return { error: t.errors.forbidden };

  const kind = str(formData, "kind");
  const locationKind = str(formData, "locationKind");
  const parentShootId = str(formData, "parentShootId");

  const shoot = await createShoot(ctx, {
    clientId,
    title,
    kind: kind === "photo" || kind === "video" || kind === "both" ? kind : null,
    requestedDate: str(formData, "requestedDate"),
    requestedTime: str(formData, "requestedTime"),
    requestedNotes: str(formData, "requestedNotes"),
    locationKind:
      locationKind === "studio" || locationKind === "on_location" ? locationKind : null,
    address: str(formData, "address"),
    cameraCount: num(formData, "cameraCount"),
    reelsRequired: num(formData, "reelsRequired"),
    photosRequired: num(formData, "photosRequired"),
    products: str(formData, "products"),
    moodboardUrl: str(formData, "moodboardUrl"),
    notes: str(formData, "notes"),
    parentShootId,
    reshootReason: parentShootId ? str(formData, "reshootReason") : null,
  });

  await announceNewRequest(shoot);

  revalidatePath("/portal");
  revalidatePath("/requests");
  redirect(`/portal/${shoot.id}`);
}

/**
 * The client accepting the final cut. The only write a client makes to a shoot
 * after submitting it, and the thing that closes the loop the spec describes.
 */
export async function approveFinalAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireRole("client");
  const { t } = await getT();

  const deliverableId = formData.get("deliverableId");
  const shootId = formData.get("shootId");
  if (typeof deliverableId !== "string" || typeof shootId !== "string") {
    return { error: t.errors.notFound };
  }

  const ratingRaw = num(formData, "rating");
  const rating = ratingRaw && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;

  await approveFinal(ctx, deliverableId, { rating, note: str(formData, "note") });

  const shoot = await getShoot(ctx, shootId);
  if (shoot) await announceApproval(shoot);

  revalidatePath(`/portal/${shootId}`);
  return { ok: t.deliverable.approved };
}
