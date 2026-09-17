"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getT } from "@/lib/i18n/server";
import { verifyPassword } from "@/lib/auth/password";
import { clientIp, homeFor, LOCKOUT, startSession } from "@/lib/auth/session";
import { findByEmailForLogin, markLogin } from "@/lib/db/repo/users";
import { clearFailures, recentFailures, recordLoginAttempt } from "@/lib/db/repo/sessions";
import type { FormState } from "../state";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getT();

  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  // A malformed address and a wrong password give the same answer: anything
  // more specific tells an attacker which half to keep guessing.
  if (!parsed.success) return { error: t.auth.badCredentials };

  const { email, password } = parsed.data;
  const ip = await clientIp();

  if ((await recentFailures(email, LOCKOUT.windowMinutes)) >= LOCKOUT.maxFailures) {
    return { error: t.auth.badCredentials };
  }

  const user = await findByEmailForLogin(email);

  // Distinguishing "no such account" from "wrong password" would turn the
  // login form into a way to enumerate the agency's client list.
  if (!user || !user.active) {
    await recordLoginAttempt(email, false, ip);
    return { error: t.auth.badCredentials };
  }

  // A dormant account is a different matter: that person is legitimate and
  // needs telling to open their invite rather than keep guessing.
  if (!user.passwordHash) {
    await recordLoginAttempt(email, false, ip);
    return { error: t.auth.accountNotActivated };
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordLoginAttempt(email, false, ip);
    return { error: t.auth.badCredentials };
  }

  await recordLoginAttempt(email, true, ip);
  await clearFailures(email);
  await markLogin(user.id);
  await startSession(user.id, user.locale);

  // redirect() signals by throwing, so nothing may catch below this line.
  redirect(homeFor(user.role));
}
