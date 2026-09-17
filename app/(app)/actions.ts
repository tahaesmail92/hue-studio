"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { endSession, requireUser } from "@/lib/auth/session";
import { setLocale } from "@/lib/db/repo/users";
import { isLocale } from "@/lib/i18n";

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

/**
 * The switcher writes the cookie itself, which is what re-renders the page.
 * This persists the same choice to the account, so the next sign-in - on any
 * device - starts in the language the person actually uses.
 */
export async function setLocaleAction(locale: string): Promise<void> {
  const user = await requireUser();
  if (!isLocale(locale)) return;
  await setLocale(user.userId, locale);
  revalidatePath("/", "layout");
}
