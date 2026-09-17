// The dictionaries and the helpers that format in them.
//
// Deliberately free of any Next.js import: the background worker renders the
// same emails this module's strings feed, and it is a plain Node process that
// cannot load next/headers. Reading the ACTIVE locale lives in ./server.ts.
//
// The dictionary is plain data on purpose: a Server Component reads it
// directly, and a Client Component receives the strings it needs as props.
// Importing data out of a "use client" module into a Server Component hands
// the server a client reference instead of the value - a whole app has gone
// down that way before.
import type { Locale } from "../types.ts";
import { ar, type Dictionary } from "./ar.ts";
import { en } from "./en.ts";

export type { Dictionary };
export const LOCALE_COOKIE = "hue_locale";

const DICTIONARIES: Record<Locale, Dictionary> = { ar, en };

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export function isLocale(value: unknown): value is Locale {
  return value === "ar" || value === "en";
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Fills {placeholders} in a dictionary string. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}

// ---------------------------------------------------------------------------
// Formatting
//
// Latin digits everywhere inside the system, including the Arabic UI: the team
// reads references, counts and times faster in them, and they copy-paste into
// WhatsApp intact. Arabic-Indic digits belong on a client-facing PDF, and that
// is the only place toArabicDigits is used.
// ---------------------------------------------------------------------------

export function formatDate(instant: Date | null, locale: Locale, timeZone: string): string {
  if (!instant) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    numberingSystem: "latn",
  }).format(instant);
}

export function formatDateTime(instant: Date | null, locale: Locale, timeZone: string): string {
  if (!instant) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "ar",
    numberingSystem: "latn",
  }).format(instant);
}

export function formatTime(instant: Date | null, locale: Locale, timeZone: string): string {
  if (!instant) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "ar",
    numberingSystem: "latn",
  }).format(instant);
}

/** "3 س 30 د" / "3h 30m" - a shoot window read at a glance. */
export function formatDuration(minutes: number, locale: Locale): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = locale === "ar" ? "س" : "h";
  const m = locale === "ar" ? "د" : "m";
  if (hours && rest) return `${hours}${h} ${rest}${m}`;
  if (hours) return `${hours}${h}`;
  return `${rest}${m}`;
}

const ARABIC_INDIC = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** Customer-facing PDFs only. Never in the UI - see the note above. */
export function toArabicDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => ARABIC_INDIC[Number(d)]);
}
