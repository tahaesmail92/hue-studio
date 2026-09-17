import { cookies } from "next/headers";
import type { Locale } from "../types.ts";
import { dictionaryFor, dirFor, isLocale, LOCALE_COOKIE, type Dictionary } from "./index.ts";

/**
 * Reading the active locale. Request-bound, so it lives apart from the
 * dictionaries themselves - importing next/headers from lib/i18n/index.ts
 * would make the worker unable to load a single email template.
 *
 * The cookie is the single source of truth per request. It is written at login
 * from the user's stored preference and whenever they use the switcher, so a
 * signed-out page and a signed-in one agree without a database read.
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const value = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(value)) return value;
  return process.env.DEFAULT_LOCALE === "en" ? "en" : "ar";
}

export async function getT(): Promise<{ locale: Locale; t: Dictionary; dir: "rtl" | "ltr" }> {
  const locale = await getLocale();
  return { locale, t: dictionaryFor(locale), dir: dirFor(locale) };
}
