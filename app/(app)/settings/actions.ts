"use server";

import { revalidatePath } from "next/cache";
import { getT } from "@/lib/i18n/server";
import { requireRole } from "@/lib/auth/session";
import {
  addBlackout,
  removeBlackout,
  updateSettings,
  type WorkingHours,
} from "@/lib/db/repo/settings";
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
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

export async function saveSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireRole("admin");
  const { t } = await getT();

  // Working hours arrive as one open/close pair per weekday; a day with no
  // open time is closed, which is how Friday is expressed.
  const workingHours: WorkingHours = {};
  for (let weekday = 0; weekday < 7; weekday++) {
    const open = str(formData, `open-${weekday}`);
    const close = str(formData, `close-${weekday}`);
    workingHours[String(weekday)] = open && close ? [[open, close]] : [];
  }

  // "24, 2" and "24،2" both mean the same thing to a person, so both are read.
  const offsets = (str(formData, "reminderOffsetsHours") ?? "")
    .split(/[,،\s]+/)
    .map((part) => Number(part))
    .filter((hours) => Number.isFinite(hours) && hours > 0 && hours <= 720);

  await updateSettings(ctx, {
    companyName: str(formData, "companyName") ?? undefined,
    companyEmail: str(formData, "companyEmail"),
    companyPhone: str(formData, "companyPhone"),
    companyAddress: str(formData, "companyAddress"),
    workingHours,
    defaultSetupMinutes: num(formData, "defaultSetupMinutes") ?? undefined,
    defaultTeardownMinutes: num(formData, "defaultTeardownMinutes") ?? undefined,
    defaultDurationMinutes: num(formData, "defaultDurationMinutes") ?? undefined,
    reminderOffsetsHours: offsets.length > 0 ? offsets : undefined,
    allowSelfReset: formData.get("allowSelfReset") === "on",
  });

  revalidatePath("/settings");
  revalidatePath("/login");
  return { ok: t.common.saved };
}

export async function addBlackoutAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireRole("admin");
  const { t } = await getT();

  const day = str(formData, "day");
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: t.common.required };

  await addBlackout(ctx, day, str(formData, "reason"));
  revalidatePath("/settings");
  revalidatePath("/calendar");
  return { ok: t.common.saved };
}

export async function removeBlackoutAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { ctx } = await requireRole("admin");
  const { t } = await getT();

  const day = str(formData, "day");
  if (!day) return { error: t.errors.notFound };

  await removeBlackout(ctx, day);
  revalidatePath("/settings");
  revalidatePath("/calendar");
  return { ok: t.common.saved };
}
