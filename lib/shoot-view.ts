import type { Assignment, Shoot } from "./db/repo/shoots.ts";
import type { Locale } from "./types.ts";
import { dictionaryFor, formatDate, formatDateTime, formatTime } from "./i18n/index.ts";
import type { ShootSummary } from "./mail/templates.ts";

/**
 * How a shoot is described to a person - one place, so the email, the PDF and
 * the screen never disagree about what was agreed.
 *
 * Everything is rendered in the SHOOT's timezone, which was copied from the
 * client when the request was made. A confirmation already sent has to keep
 * meaning what it said even if the client later moves.
 */

export function whenLine(shoot: Shoot, locale: Locale): string {
  if (!shoot.startsAt) {
    // Not yet confirmed: show what the client asked for, marked as a request.
    const t = dictionaryFor(locale);
    if (!shoot.requestedDate) return t.common.none;
    const asked = `${shoot.requestedDate}${shoot.requestedTime ? ` · ${shoot.requestedTime.slice(0, 5)}` : ""}`;
    return locale === "ar" ? `${asked} (مقترح)` : `${asked} (requested)`;
  }

  const date = formatDate(shoot.startsAt, locale, shoot.timezone);
  const start = formatTime(shoot.startsAt, locale, shoot.timezone);
  const end = shoot.endsAt ? formatTime(shoot.endsAt, locale, shoot.timezone) : null;

  // The time range reads left-to-right in both languages: "09:00 - 13:00" is
  // a range, not a sentence, and flipping it makes it look like 13:00 to 09:00.
  return end ? `${date} · ${start} – ${end}` : `${date} · ${start}`;
}

/** "الموعد يشمل ساعة تجهيز" - the part clients are surprised by otherwise. */
export function setupLine(shoot: Shoot, locale: Locale): string {
  const t = dictionaryFor(locale);
  if (!shoot.setupMinutes && !shoot.teardownMinutes) return t.common.none;

  const parts: string[] = [];
  if (shoot.setupMinutes) {
    parts.push(
      locale === "ar"
        ? `تجهيز ${shoot.setupMinutes} دقيقة`
        : `${shoot.setupMinutes} min setup`,
    );
  }
  if (shoot.teardownMinutes) {
    parts.push(
      locale === "ar"
        ? `تفكيك ${shoot.teardownMinutes} دقيقة`
        : `${shoot.teardownMinutes} min teardown`,
    );
  }
  return parts.join(locale === "ar" ? " · " : " · ");
}

export function locationLine(shoot: Shoot, locale: Locale): string {
  const t = dictionaryFor(locale);
  const parts: string[] = [];

  if (shoot.locationKind) parts.push(t.locationKind[shoot.locationKind]);
  if (shoot.locationName) parts.push(shoot.locationName);
  if (shoot.address) parts.push(shoot.address);

  return parts.length > 0 ? parts.join(" — ") : t.common.none;
}

export function crewLine(assignments: Assignment[], locale: Locale): string {
  const t = dictionaryFor(locale);
  const people = assignments.filter((a) => a.kind === "person");
  if (people.length === 0) return t.common.none;

  return people
    .map((a) => {
      const craft = a.craft ? t.craft[a.craft as keyof typeof t.craft] : null;
      return craft ? `${a.name} (${craft})` : a.name;
    })
    .join("، ");
}

export function kitLine(assignments: Assignment[], locale: Locale): string {
  const t = dictionaryFor(locale);
  const kit = assignments.filter((a) => a.kind === "equipment");
  return kit.length > 0 ? kit.map((a) => a.name).join("، ") : t.common.none;
}

/**
 * The timezone, named the way a person would say it rather than as an IANA
 * identifier. A client in Riyadh reading "Africa/Cairo" learns nothing useful.
 */
export function timezoneLabel(timezone: string, locale: Locale): string {
  const named: Record<string, { ar: string; en: string }> = {
    "Africa/Cairo": { ar: "بتوقيت القاهرة", en: "Cairo time" },
    "Asia/Riyadh": { ar: "بتوقيت الرياض", en: "Riyadh time" },
    "Asia/Dubai": { ar: "بتوقيت دبي", en: "Dubai time" },
  };
  const label = named[timezone];
  if (label) return label[locale];
  return locale === "ar" ? `بتوقيت ${timezone}` : `${timezone} time`;
}

/** The shape the email templates take. */
export function toSummary(
  shoot: Shoot,
  assignments: Assignment[],
  locale: Locale,
): ShootSummary {
  return {
    ref: shoot.ref,
    title: shoot.title,
    clientName: shoot.clientName,
    when: whenLine(shoot, locale),
    location: locationLine(shoot, locale),
    crew: crewLine(assignments, locale),
    timezoneLabel: timezoneLabel(shoot.timezone, locale),
  };
}

/** For the audit timeline and anywhere an exact instant matters. */
export function stamp(instant: Date, locale: Locale, timezone: string): string {
  return formatDateTime(instant, locale, timezone);
}
