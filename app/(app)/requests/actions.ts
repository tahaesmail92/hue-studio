"use server";

import { revalidatePath } from "next/cache";
import { getT } from "@/lib/i18n/server";
import { requireStaff } from "@/lib/auth/session";
import { zonedToInstant } from "@/lib/time";
import {
  ConflictError,
  addNote,
  confirmShoot,
  getShoot,
  rescheduleShoot,
  setStatus,
  shootResources,
  updateShootDetails,
} from "@/lib/db/repo/shoots";
import { getSettings } from "@/lib/db/repo/settings";
import {
  announceConfirmation,
  announceDelivered,
  announceRejected,
} from "@/lib/announce";
import { addDeliverable, setDeliverableVisibility, removeDeliverable } from "@/lib/db/repo/deliverables";
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
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Approving a request.
 *
 * The times arrive from two `datetime-local` inputs, which carry no timezone
 * at all. They are read in the SHOOT's zone - a Riyadh client's 9am is 9am in
 * Riyadh even when the producer typing it is sitting in Cairo.
 */
export async function confirmAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const id = formData.get("id");
  if (typeof id !== "string") return { error: t.errors.notFound };

  const shoot = await getShoot(ctx, id);
  if (!shoot) return { error: t.errors.notFound };

  const startLocal = str(formData, "startsAt");
  const endLocal = str(formData, "endsAt");
  if (!startLocal || !endLocal) return { error: t.errors.pickTime };

  const startsAt = zonedToInstant(startLocal, shoot.timezone);
  const endsAt = zonedToInstant(endLocal, shoot.timezone);
  if (!startsAt || !endsAt) return { error: t.errors.pickTime };
  if (endsAt <= startsAt) return { error: t.errors.endBeforeStart };

  const resourceIds = formData.getAll("resourceIds").filter((v): v is string => typeof v === "string");
  if (resourceIds.length === 0) return { error: t.errors.pickResource };

  const settings = await getSettings();
  const locationKind = str(formData, "locationKind");

  try {
    await confirmShoot(ctx, id, {
      startsAt,
      endsAt,
      setupMinutes: num(formData, "setupMinutes") ?? settings.defaultSetupMinutes,
      teardownMinutes: num(formData, "teardownMinutes") ?? settings.defaultTeardownMinutes,
      locationKind: locationKind === "studio" || locationKind === "on_location"
        ? locationKind
        : null,
      locationResourceId: str(formData, "locationResourceId"),
      address: str(formData, "address"),
      mapUrl: str(formData, "mapUrl"),
      resourceIds,
    });
  } catch (err) {
    // The database refused because a resource is already booked. That is a
    // normal thing for a producer to run into, not a crash.
    if (err instanceof ConflictError) return { error: t.conflict.blocked };
    throw err;
  }

  const fresh = await getShoot(ctx, id);
  if (fresh) await announceConfirmation(fresh, await shootResources(ctx, id));

  revalidatePath(`/requests/${id}`);
  revalidatePath("/requests");
  revalidatePath("/calendar");
  return { ok: t.common.saved };
}

export async function rescheduleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const id = formData.get("id");
  if (typeof id !== "string") return { error: t.errors.notFound };

  const shoot = await getShoot(ctx, id);
  if (!shoot) return { error: t.errors.notFound };

  const startLocal = str(formData, "startsAt");
  const endLocal = str(formData, "endsAt");
  if (!startLocal || !endLocal) return { error: t.errors.pickTime };

  const startsAt = zonedToInstant(startLocal, shoot.timezone);
  const endsAt = zonedToInstant(endLocal, shoot.timezone);
  if (!startsAt || !endsAt) return { error: t.errors.pickTime };
  if (endsAt <= startsAt) return { error: t.errors.endBeforeStart };

  try {
    await rescheduleShoot(ctx, id, { startsAt, endsAt, note: str(formData, "note") });
  } catch (err) {
    if (err instanceof ConflictError) return { error: t.conflict.blocked };
    throw err;
  }

  const fresh = await getShoot(ctx, id);
  if (fresh) {
    // The client gets the same document again, worded as a change. A moved
    // date with no new confirmation is how disputes start.
    await announceConfirmation(fresh, await shootResources(ctx, id), { rescheduled: true });
  }

  revalidatePath(`/requests/${id}`);
  revalidatePath("/calendar");
  return { ok: t.common.saved };
}

export async function rejectAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const id = formData.get("id");
  const reason = str(formData, "reason");
  if (typeof id !== "string") return { error: t.errors.notFound };
  // A refusal without a reason is the thing clients remember. Require one.
  if (!reason) return { error: t.common.required };

  await setStatus(ctx, id, "rejected", reason);
  const shoot = await getShoot(ctx, id);
  if (shoot) await announceRejected(shoot, reason);

  revalidatePath(`/requests/${id}`);
  revalidatePath("/requests");
  return { ok: t.common.saved };
}

export async function statusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const id = formData.get("id");
  const status = formData.get("status");
  if (typeof id !== "string" || typeof status !== "string") return { error: t.errors.notFound };

  const allowed = ["in_progress", "completed", "cancelled", "delivered"] as const;
  if (!allowed.includes(status as (typeof allowed)[number])) return { error: t.errors.generic };

  try {
    await setStatus(ctx, id, status as (typeof allowed)[number], str(formData, "reason"));
  } catch (err) {
    if (err instanceof ConflictError) return { error: t.conflict.blocked };
    throw err;
  }

  revalidatePath(`/requests/${id}`);
  revalidatePath("/requests");
  revalidatePath("/calendar");
  return { ok: t.common.saved };
}

export async function updateDetailsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const id = formData.get("id");
  if (typeof id !== "string") return { error: t.errors.notFound };

  const kind = str(formData, "kind");
  await updateShootDetails(ctx, id, {
    title: str(formData, "title") ?? undefined,
    kind: kind === "photo" || kind === "video" || kind === "both" ? kind : null,
    cameraCount: num(formData, "cameraCount"),
    reelsRequired: num(formData, "reelsRequired"),
    photosRequired: num(formData, "photosRequired"),
    products: str(formData, "products"),
    moodboardUrl: str(formData, "moodboardUrl"),
    notes: str(formData, "notes"),
    address: str(formData, "address"),
  });

  revalidatePath(`/requests/${id}`);
  return { ok: t.common.saved };
}

export async function addNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const id = formData.get("id");
  const note = str(formData, "note");
  if (typeof id !== "string" || !note) return { error: t.common.required };

  await addNote(ctx, id, note);
  revalidatePath(`/requests/${id}`);
  return { ok: t.common.saved };
}

// ---------------------------------------------------------------------------
// Handover
// ---------------------------------------------------------------------------

export async function addDeliverableAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const shootId = formData.get("shootId");
  const kind = formData.get("kind");
  const url = str(formData, "url");

  if (typeof shootId !== "string" || !url) return { error: t.common.required };
  if (kind !== "raw" && kind !== "final") return { error: t.common.required };
  if (!/^https?:\/\//i.test(url)) return { error: t.errors.invalidUrl };

  // Visibility is not asked for here: the default rule in the repository -
  // the final cut is for the client, raw footage is for the crew - is right
  // almost every time, and the per-link toggle covers the rest.
  await addDeliverable(ctx, {
    shootId,
    kind,
    url,
    label: str(formData, "label"),
  });

  // Sharing the final cut is the act that tells the client the work is done.
  if (kind === "final") {
    const shoot = await getShoot(ctx, shootId);
    if (shoot) await announceDelivered(shoot, await shootResources(ctx, shootId));
  }

  revalidatePath(`/requests/${shootId}`);
  return { ok: t.common.saved };
}

export async function toggleDeliverableAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const id = formData.get("id");
  const shootId = formData.get("shootId");
  const visible = formData.get("visible") === "true";
  if (typeof id !== "string" || typeof shootId !== "string") return { error: t.errors.notFound };

  await setDeliverableVisibility(ctx, id, visible);
  revalidatePath(`/requests/${shootId}`);
  return { ok: t.common.saved };
}

export async function removeDeliverableAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const id = formData.get("id");
  const shootId = formData.get("shootId");
  if (typeof id !== "string" || typeof shootId !== "string") return { error: t.errors.notFound };

  await removeDeliverable(ctx, id);
  revalidatePath(`/requests/${shootId}`);
  return { ok: t.common.saved };
}
