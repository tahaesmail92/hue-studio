import { renderToBuffer } from "@react-pdf/renderer";
import type { Assignment, Shoot } from "../db/repo/shoots.ts";
import type { Settings } from "../db/repo/settings.ts";
import type { Locale } from "../types.ts";
import { dictionaryFor, formatDateTime } from "../i18n/index.ts";
import {
  crewLine,
  kitLine,
  locationLine,
  setupLine,
  timezoneLabel,
  whenLine,
} from "../shoot-view.ts";
import { StudioDocument, type PdfRow } from "./document.tsx";

function nonEmpty(rows: PdfRow[]): PdfRow[] {
  return rows.filter(([, value]) => value && value.trim() !== "");
}

/**
 * The formal confirmation: what was agreed, in one fixed shape, on one page.
 *
 * Deliberately free of logistics the client does not need - camera counts and
 * setup crew belong on the call sheet, not on the document the client files.
 */
export async function confirmationPdf(input: {
  shoot: Shoot;
  assignments: Assignment[];
  settings: Settings;
  locale: Locale;
}): Promise<Buffer> {
  const { shoot, locale } = input;
  const t = dictionaryFor(locale);
  const ar = locale === "ar";

  const sections = [
    {
      title: ar ? "تفاصيل الجلسة" : "Shoot details",
      rows: nonEmpty([
        [t.shoot.client, shoot.clientName],
        [t.shoot.title, shoot.title],
        [t.shoot.kind, shoot.kind ? t.shootKind[shoot.kind] : ""],
        [t.common.status, t.shootStatus[shoot.status]],
      ]),
    },
    {
      title: ar ? "الموعد والمكان" : "When and where",
      rows: nonEmpty([
        [ar ? "الموعد" : "When", whenLine(shoot, locale)],
        [ar ? "التوقيت" : "Timezone", timezoneLabel(shoot.timezone, locale)],
        [ar ? "التجهيز" : "Setup", setupLine(shoot, locale)],
        [t.shoot.location, locationLine(shoot, locale)],
      ]),
    },
    {
      title: ar ? "الفريق والمطلوب" : "Crew and scope",
      rows: nonEmpty([
        [t.shoot.crew, crewLine(input.assignments, locale)],
        [t.shoot.reelsRequired, shoot.reelsRequired ? String(shoot.reelsRequired) : ""],
        [t.shoot.photosRequired, shoot.photosRequired ? String(shoot.photosRequired) : ""],
        [t.shoot.products, shoot.products ?? ""],
      ]),
    },
  ].filter((section) => section.rows.length > 0);

  const note = ar
    ? "التفاصيل دي هي المعتمدة للجلسة. لو حصل أي تعديل، هيوصلكم تأكيد جديد بنفس الشكل."
    : "These are the agreed details for this shoot. If anything changes, a new confirmation will follow in the same form.";

  const issued = formatDateTime(new Date(), locale, shoot.timezone);
  const footer = ar
    ? `${input.settings.companyName} · صدر في ${issued} · ${shoot.ref}`
    : `${input.settings.companyName} · issued ${issued} · ${shoot.ref}`;

  return renderToBuffer(
    <StudioDocument
      locale={locale}
      brandName={input.settings.companyName}
      docTitle={ar ? "تأكيد موعد جلسة تصوير" : "Shoot booking confirmation"}
      reference={shoot.ref}
      sections={sections}
      note={note}
      footer={footer}
    />,
  );
}

/**
 * The call sheet: everything the crew needs on the day and nothing they do not.
 *
 * This is the "clear logistical picture before shoot day" the spec asks for in
 * its goals, in the form the industry already reads.
 */
export async function callSheetPdf(input: {
  shoot: Shoot;
  assignments: Assignment[];
  settings: Settings;
  locale: Locale;
}): Promise<Buffer> {
  const { shoot, locale } = input;
  const t = dictionaryFor(locale);
  const ar = locale === "ar";

  // The crew is called before the client arrives - that gap IS the setup time,
  // so it is computed rather than left for someone to work out on the morning.
  const callTime =
    shoot.startsAt && shoot.setupMinutes
      ? new Date(shoot.startsAt.getTime() - shoot.setupMinutes * 60_000)
      : shoot.startsAt;

  const sections = [
    {
      title: ar ? "المواعيد" : "Times",
      rows: nonEmpty([
        [
          ar ? "نداء الفريق" : "Crew call",
          callTime ? formatDateTime(callTime, locale, shoot.timezone) : "",
        ],
        [
          ar ? "بداية التصوير" : "Shoot starts",
          shoot.startsAt ? formatDateTime(shoot.startsAt, locale, shoot.timezone) : "",
        ],
        [
          ar ? "النهاية المتوقعة" : "Expected wrap",
          shoot.endsAt ? formatDateTime(shoot.endsAt, locale, shoot.timezone) : "",
        ],
        [ar ? "التوقيت" : "Timezone", timezoneLabel(shoot.timezone, locale)],
      ]),
    },
    {
      title: ar ? "الموقع" : "Location",
      rows: nonEmpty([
        [t.shoot.location, locationLine(shoot, locale)],
        [t.shoot.address, shoot.address ?? ""],
        [t.shoot.mapUrl, shoot.mapUrl ?? ""],
      ]),
    },
    {
      title: ar ? "الفريق والمعدات" : "Crew and kit",
      rows: nonEmpty([
        [t.shoot.crew, crewLine(input.assignments, locale)],
        [t.resourceKind.equipment, kitLine(input.assignments, locale)],
        [t.shoot.cameraCount, shoot.cameraCount ? String(shoot.cameraCount) : ""],
      ]),
    },
    {
      title: ar ? "المطلوب تصويره" : "What we are shooting",
      rows: nonEmpty([
        [t.shoot.client, shoot.clientName],
        [t.shoot.kind, shoot.kind ? t.shootKind[shoot.kind] : ""],
        [t.shoot.reelsRequired, shoot.reelsRequired ? String(shoot.reelsRequired) : ""],
        [t.shoot.photosRequired, shoot.photosRequired ? String(shoot.photosRequired) : ""],
        [t.shoot.products, shoot.products ?? ""],
        [t.shoot.moodboard, shoot.moodboardUrl ?? ""],
      ]),
    },
  ].filter((section) => section.rows.length > 0);

  const issued = formatDateTime(new Date(), locale, shoot.timezone);
  const footer = ar
    ? `${input.settings.companyName} · ورقة نداء · صدرت في ${issued} · ${shoot.ref}`
    : `${input.settings.companyName} · call sheet · issued ${issued} · ${shoot.ref}`;

  return renderToBuffer(
    <StudioDocument
      locale={locale}
      brandName={input.settings.companyName}
      docTitle={ar ? "ورقة نداء" : "Call sheet"}
      reference={`${shoot.ref} — ${shoot.title}`}
      sections={sections}
      note={shoot.notes}
      footer={footer}
    />,
  );
}
