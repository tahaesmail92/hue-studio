import type { Locale } from "../types.ts";
import { dictionaryFor, dirFor } from "../i18n/index.ts";
import type { Message } from "./send.ts";

// Brand tokens repeated as literals: an email client has no CSS variables and
// no stylesheet, so everything must be inline hex.
const CORAL = "#E35657";
const ORANGE = "#FE8F4B";
const INK = "#1a1a1c";
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
 * clients ignore @font-face anyway, so the stack falls back gracefully rather
 * than shipping a download that half the recipients cannot use.
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
    <tr><td style="padding:20px 8px;text-align:${align};font-size:12px;color:#6b6b70;">
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
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">${escapeHtml(text)}</p>`;
}

/** The link in plain text too: some clients strip the button entirely. */
function fallbackLink(url: string, note: string): string {
  return `<p style="margin:24px 0 0;font-size:12px;color:#6b6b70;line-height:1.6;">
    ${escapeHtml(note)}<br>
    <span style="direction:ltr;unicode-bidi:isolate;word-break:break-all;">${escapeHtml(url)}</span>
  </p>`;
}

// ---------------------------------------------------------------------------
// Invitation. This is what replaces the spec's emailed plaintext password:
// the recipient chooses their own, and nothing secret is ever readable in the
// mailbox after the link is used once.
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

  const subject = ar
    ? "دعوتك للدخول إلى استوديو هيو"
    : "Your invitation to HUE Studio";

  const greeting = ar ? `أهلًا ${input.fullName}،` : `Hello ${input.fullName},`;
  const intro = ar
    ? "تم إنشاء حساب لك على نظام حجز جلسات الإنتاج في هيو. اضغط الزر لتعيين كلمة المرور الخاصة بك والدخول."
    : "An account has been created for you on HUE's production booking system. Use the button below to set your own password and sign in.";
  const validity = ar
    ? `هذا الرابط صالح لمدة ${days} أيام، ويُستخدم مرة واحدة فقط.`
    : `This link is valid for ${days} days and can be used once.`;
  const cta = ar ? "تعيين كلمة المرور" : "Set your password";
  const note = ar ? "لو الزر ما اشتغلش، انسخ الرابط ده:" : "If the button does not work, copy this link:";

  const html = shell(
    input.locale,
    paragraph(greeting) + paragraph(intro) + button(cta, input.url) +
      `<p style="margin:20px 0 0;font-size:13px;color:#6b6b70;">${escapeHtml(validity)}</p>` +
      fallbackLink(input.url, note),
  );

  const text = [greeting, "", intro, "", input.url, "", validity].join("\n");
  return { to: input.to, subject, html, text, template: "invite" };
}

// ---------------------------------------------------------------------------
// Password reset. Same mechanism, different wording - and a deliberate line
// telling the recipient to ignore it if they did not ask, because that is the
// one signal an account holder can act on.
// ---------------------------------------------------------------------------

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
  const ignore = ar
    ? "لو مش إنت اللي طلبت ده، تجاهل الرسالة — كلمة المرور الحالية هتفضل شغالة."
    : "If you did not request this, ignore this email - your current password still works.";
  const cta = ar ? "تعيين كلمة مرور جديدة" : "Set a new password";
  const note = ar ? "لو الزر ما اشتغلش، انسخ الرابط ده:" : "If the button does not work, copy this link:";

  const html = shell(
    input.locale,
    paragraph(greeting) + paragraph(intro) + button(cta, input.url) +
      `<p style="margin:20px 0 0;font-size:13px;color:#6b6b70;">${escapeHtml(ignore)}</p>` +
      fallbackLink(input.url, note),
  );

  const text = [greeting, "", intro, "", input.url, "", ignore].join("\n");
  return { to: input.to, subject, html, text, template: "reset" };
}
