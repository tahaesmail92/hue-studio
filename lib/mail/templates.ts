import type { Locale } from "../types.ts";
import { dictionaryFor, dirFor } from "../i18n/index.ts";
import type { Message } from "./send.ts";

// Brand tokens as literals: an email client has no CSS variables and no
// stylesheet, so everything must be inline hex.
const CORAL = "#E35657";
const ORANGE = "#FE8F4B";
const INK = "#1a1a1c";
const MUTED = "#6b6b70";
const PAPER = "#fbf7f2";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The shared shell: the coral-to-orange signature as a rule under the
 * wordmark, near-monochrome everywhere else.
 *
 * Fonts are named but not webfont-loaded - Outlook and most Arabic mail
 * clients ignore @font-face, so the stack falls back gracefully rather than
 * shipping a download half the recipients cannot use.
 */
function shell(locale: Locale, body: string): string {
  const dir = dirFor(locale);
  const t = dictionaryFor(locale);
  const align = dir === "rtl" ? "right" : "left";

  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:${PAPER};color:${INK};
             font-family:'IBM Plex Sans Arabic',-apple-system,Segoe UI,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td style="background:#ffffff;border-radius:16px;padding:32px;text-align:${align};">
      <div style="font-family:Alexandria,'IBM Plex Sans Arabic',sans-serif;font-weight:800;
                  font-size:20px;letter-spacing:-0.01em;">${escapeHtml(t.app.name)}</div>
      <div style="height:3px;width:56px;margin:12px 0 24px;border-radius:2px;
                  background:linear-gradient(100deg,${CORAL},${ORANGE});"></div>
      ${body}
    </td></tr>
    <tr><td style="padding:20px 8px;text-align:${align};font-size:12px;color:${MUTED};">
      ${escapeHtml(t.app.tagline)}
    </td></tr>
  </table>
</body></html>`;
}

function button(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}"
     style="display:inline-block;background:${CORAL};color:#ffffff;text-decoration:none;
            padding:13px 26px;border-radius:10px;font-weight:600;font-size:15px;">
    ${escapeHtml(label)}
  </a>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.8;">${escapeHtml(text)}</p>`;
}

function muted(text: string): string {
  return `<p style="margin:20px 0 0;font-size:13px;color:${MUTED};line-height:1.7;">${escapeHtml(text)}</p>`;
}

/**
 * The booking details, as a table. Every confirmation looks identical, which
 * is the whole point of the spec asking for one standard form of words.
 */
function detailTable(rows: [string, string][], dir: "rtl" | "ltr"): string {
  const labelAlign = dir === "rtl" ? "right" : "left";
  const cells = rows
    .filter(([, value]) => value && value !== "—")
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:9px 0;font-size:13px;color:${MUTED};white-space:nowrap;
                   text-align:${labelAlign};vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:9px 0 9px 16px;font-size:14px;font-weight:600;
                   text-align:${labelAlign};">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
     style="margin:8px 0 24px;border-top:1px solid #eee;border-bottom:1px solid #eee;">
    ${cells}
  </table>`;
}

/** The link in plain text too: some clients strip the button entirely. */
function fallbackLink(url: string, note: string): string {
  return `<p style="margin:24px 0 0;font-size:12px;color:${MUTED};line-height:1.6;">
    ${escapeHtml(note)}<br>
    <span style="direction:ltr;unicode-bidi:isolate;word-break:break-all;">${escapeHtml(url)}</span>
  </p>`;
}

const LINK_NOTE = {
  ar: "لو الزر ما اشتغلش، انسخ الرابط ده وافتحه في المتصفح:",
  en: "If the button does not work, copy this link into your browser:",
};

// ---------------------------------------------------------------------------
// Account access
//
// This is what replaces the spec's emailed plaintext password: the recipient
// chooses their own, and nothing secret stays readable in the mailbox.
// ---------------------------------------------------------------------------

export function inviteEmail(input: {
  to: string;
  fullName: string;
  url: string;
  locale: Locale;
  expiresAt: Date;
}): Message {
  const ar = input.locale === "ar";
  const days = Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 86_400_000));

  const subject = ar ? "دعوتك للدخول إلى استوديو هيو" : "Your invitation to HUE Studio";
  const greeting = ar ? `أهلًا ${input.fullName}،` : `Hello ${input.fullName},`;
  const intro = ar
    ? "أنشأنا لك حسابًا على نظام حجز جلسات التصوير في هيو. من الزر التالي تختار كلمة المرور الخاصة بك وتدخل على حسابك."
    : "We have created an account for you on HUE's shoot booking system. Use the button below to choose your own password and sign in.";
  const validity = ar
    ? `الرابط صالح ${days} أيام، ويعمل مرة واحدة فقط.`
    : `The link is valid for ${days} days and works once.`;
  const cta = ar ? "اختيار كلمة المرور" : "Choose your password";

  const html = shell(
    input.locale,
    paragraph(greeting) + paragraph(intro) + button(cta, input.url) +
      muted(validity) + fallbackLink(input.url, LINK_NOTE[input.locale]),
  );
  const text = [greeting, "", intro, "", input.url, "", validity].join("\n");
  return { to: input.to, subject, html, text, template: "invite" };
}

export function resetEmail(input: {
  to: string;
  fullName: string;
  url: string;
  locale: Locale;
}): Message {
  const ar = input.locale === "ar";

  const subject = ar ? "تعيين كلمة مرور جديدة" : "Set a new password";
  const greeting = ar ? `أهلًا ${input.fullName}،` : `Hello ${input.fullName},`;
  const intro = ar
    ? "وصلنا طلب لتعيين كلمة مرور جديدة لحسابك."
    : "We received a request to set a new password for your account.";
  // The one line an account holder can actually act on if this was not them.
  const ignore = ar
    ? "لو مش إنت اللي طلبت ده، تجاهل الرسالة — كلمة المرور الحالية هتفضل شغّالة."
    : "If this was not you, ignore this email - your current password still works.";
  const cta = ar ? "تعيين كلمة مرور جديدة" : "Set a new password";

  const html = shell(
    input.locale,
    paragraph(greeting) + paragraph(intro) + button(cta, input.url) +
      muted(ignore) + fallbackLink(input.url, LINK_NOTE[input.locale]),
  );
  const text = [greeting, "", intro, "", input.url, "", ignore].join("\n");
  return { to: input.to, subject, html, text, template: "reset" };
}

// ---------------------------------------------------------------------------
// The booking itself
// ---------------------------------------------------------------------------

export type ShootSummary = {
  ref: string;
  title: string;
  clientName: string;
  /** Already formatted in the shoot's own timezone by the caller. */
  when: string;
  location: string;
  crew: string;
  timezoneLabel: string;
};

/** Reaches production the moment a client submits. */
export function newRequestEmail(input: {
  to: string;
  shoot: ShootSummary;
  requestedWhen: string;
  url: string;
  locale: Locale;
}): Message {
  const ar = input.locale === "ar";
  const dir = dirFor(input.locale);

  const subject = ar
    ? `طلب جلسة جديد — ${input.shoot.clientName}: ${input.shoot.title}`
    : `New shoot request - ${input.shoot.clientName}: ${input.shoot.title}`;
  const intro = ar
    ? "وصل طلب جلسة جديد ومستني المراجعة."
    : "A new shoot request has arrived and is waiting for review.";
  const cta = ar ? "مراجعة الطلب" : "Review the request";

  const rows: [string, string][] = ar
    ? [
        ["رقم الطلب", input.shoot.ref],
        ["العميل", input.shoot.clientName],
        ["الجلسة", input.shoot.title],
        ["الموعد المقترح", input.requestedWhen],
      ]
    : [
        ["Reference", input.shoot.ref],
        ["Client", input.shoot.clientName],
        ["Shoot", input.shoot.title],
        ["Requested", input.requestedWhen],
      ];

  const html = shell(
    input.locale,
    paragraph(intro) + detailTable(rows, dir) + button(cta, input.url),
  );
  const text = [intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", input.url].join("\n");
  return { to: input.to, subject, html, text, template: "new_request" };
}

/**
 * The formal confirmation the spec is built around: one standard shape, every
 * detail settled, and a link that opens without signing in so it survives
 * being forwarded on WhatsApp.
 */
export function confirmationEmail(input: {
  to: string;
  shoot: ShootSummary;
  url: string;
  locale: Locale;
  rescheduled?: boolean;
}): Message {
  const ar = input.locale === "ar";
  const dir = dirFor(input.locale);
  const moved = input.rescheduled === true;

  const subject = moved
    ? ar
      ? `تعديل موعد الجلسة — ${input.shoot.title} (${input.shoot.ref})`
      : `Shoot rescheduled - ${input.shoot.title} (${input.shoot.ref})`
    : ar
      ? `تأكيد موعد الجلسة — ${input.shoot.title} (${input.shoot.ref})`
      : `Shoot confirmed - ${input.shoot.title} (${input.shoot.ref})`;

  const intro = moved
    ? ar
      ? "تم تعديل موعد جلستكم. التفاصيل المعتمدة بعد التعديل:"
      : "Your shoot has been rescheduled. The agreed details are now:"
    : ar
      ? "تم تأكيد موعد جلستكم. دي التفاصيل المعتمدة:"
      : "Your shoot is confirmed. Here are the agreed details:";

  const rows: [string, string][] = ar
    ? [
        ["رقم الجلسة", input.shoot.ref],
        ["الجلسة", input.shoot.title],
        ["الموعد", input.shoot.when],
        ["التوقيت", input.shoot.timezoneLabel],
        ["الموقع", input.shoot.location],
        ["فريق التصوير", input.shoot.crew],
      ]
    : [
        ["Reference", input.shoot.ref],
        ["Shoot", input.shoot.title],
        ["When", input.shoot.when],
        ["Timezone", input.shoot.timezoneLabel],
        ["Location", input.shoot.location],
        ["Crew", input.shoot.crew],
      ];

  const closing = ar
    ? "لو فيه أي تعديل مطلوب، ردّوا على الرسالة دي أو كلّمونا قبل الموعد بوقت كافٍ."
    : "If anything needs to change, reply to this email or call us in good time before the date.";
  const cta = ar ? "عرض التأكيد" : "View the confirmation";

  const html = shell(
    input.locale,
    paragraph(intro) + detailTable(rows, dir) + button(cta, input.url) + muted(closing),
  );
  const text = [intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", input.url, "", closing]
    .join("\n");

  return {
    to: input.to,
    subject,
    html,
    text,
    template: moved ? "rescheduled" : "confirmation",
  };
}

export function reminderEmail(input: {
  to: string;
  shoot: ShootSummary;
  hoursBefore: number;
  url: string;
  locale: Locale;
}): Message {
  const ar = input.locale === "ar";
  const dir = dirFor(input.locale);
  const tomorrow = input.hoursBefore >= 20;

  const subject = ar
    ? `تذكير: ${input.shoot.title} — ${input.shoot.when}`
    : `Reminder: ${input.shoot.title} - ${input.shoot.when}`;

  const intro = tomorrow
    ? ar
      ? "تذكير بموعد جلسة التصوير بكرة."
      : "A reminder that your shoot is tomorrow."
    : ar
      ? "تذكير: جلسة التصوير قربت."
      : "A reminder that your shoot is coming up shortly.";

  const rows: [string, string][] = ar
    ? [
        ["الجلسة", input.shoot.title],
        ["الموعد", input.shoot.when],
        ["الموقع", input.shoot.location],
        ["فريق التصوير", input.shoot.crew],
      ]
    : [
        ["Shoot", input.shoot.title],
        ["When", input.shoot.when],
        ["Location", input.shoot.location],
        ["Crew", input.shoot.crew],
      ];

  const cta = ar ? "تفاصيل الجلسة" : "Shoot details";
  const html = shell(
    input.locale,
    paragraph(intro) + detailTable(rows, dir) + button(cta, input.url),
  );
  const text = [intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", input.url].join("\n");
  return { to: input.to, subject, html, text, template: "reminder" };
}

export function deliveredEmail(input: {
  to: string;
  shoot: ShootSummary;
  url: string;
  locale: Locale;
}): Message {
  const ar = input.locale === "ar";

  const subject = ar
    ? `تسليم مواد الجلسة — ${input.shoot.title}`
    : `Your files are ready - ${input.shoot.title}`;
  const intro = ar
    ? `مواد جلسة "${input.shoot.title}" جاهزة ومتاحة على حسابكم.`
    : `The files from "${input.shoot.title}" are ready and waiting in your account.`;
  const ask = ar
    ? "بعد المراجعة، اضغطوا على زر اعتماد النسخة النهائية عشان نقفل الجلسة."
    : "Once you have reviewed them, use the approve button to close the shoot off.";
  const cta = ar ? "عرض المواد" : "View the files";

  const html = shell(input.locale, paragraph(intro) + button(cta, input.url) + muted(ask));
  const text = [intro, "", input.url, "", ask].join("\n");
  return { to: input.to, subject, html, text, template: "delivered" };
}

export function rejectedEmail(input: {
  to: string;
  shoot: ShootSummary;
  reason: string;
  locale: Locale;
}): Message {
  const ar = input.locale === "ar";

  const subject = ar
    ? `بخصوص طلب الجلسة — ${input.shoot.title}`
    : `About your shoot request - ${input.shoot.title}`;
  const intro = ar
    ? `للأسف مش هنقدر نأكد طلب "${input.shoot.title}" بالشكل ده.`
    : `We are not able to confirm "${input.shoot.title}" as requested.`;
  const closing = ar
    ? "تقدروا تبعتوا طلب جديد بموعد تاني في أي وقت، وإحنا تحت أمركم لو حابين نرتّبه مع بعض."
    : "You are welcome to send a new request for another date, and we are happy to work one out with you.";

  const html = shell(
    input.locale,
    paragraph(intro) + paragraph(input.reason) + muted(closing),
  );
  const text = [intro, "", input.reason, "", closing].join("\n");
  return { to: input.to, subject, html, text, template: "rejected" };
}
