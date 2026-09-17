"use server";

import { revalidatePath } from "next/cache";
import { getT } from "@/lib/i18n/server";
import { requireRole } from "@/lib/auth/session";
import { addDeliverable } from "@/lib/db/repo/deliverables";
import type { FormState } from "../state";

/**
 * Crew handing over the raw footage from the day.
 *
 * The repository refuses anything but `raw` for a crew context: publishing the
 * final cut is what tells the client the work is finished, and that call
 * belongs to production.
 */
export async function addRawAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requireRole("crew");
  const { t } = await getT();

  const shootId = formData.get("shootId");
  const url = formData.get("url");
  if (typeof shootId !== "string" || typeof url !== "string" || url.trim() === "") {
    return { error: t.common.required };
  }
  if (!/^https?:\/\//i.test(url.trim())) return { error: t.errors.invalidUrl };

  const label = formData.get("label");
  await addDeliverable(ctx, {
    shootId,
    kind: "raw",
    url: url.trim(),
    label: typeof label === "string" && label.trim() !== "" ? label.trim() : null,
  });

  revalidatePath(`/crew/${shootId}`);
  revalidatePath(`/requests/${shootId}`);
  return { ok: t.common.saved };
}
