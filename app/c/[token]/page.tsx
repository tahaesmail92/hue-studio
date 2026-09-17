import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { assignmentsByToken, getShootByToken } from "@/lib/db/repo/shoots";
import { getSettings } from "@/lib/db/repo/settings";
import { crewLine, locationLine, setupLine, timezoneLabel, whenLine } from "@/lib/shoot-view";

export const dynamic = "force-dynamic";

// A booking confirmation has no business in a search index.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The confirmation, readable without an account.
 *
 * The spec asks for one formal, identically-shaped confirmation that reaches
 * the client. In practice that document gets forwarded to a brand manager, a
 * warehouse and a driver, none of whom have logins - so it lives behind an
 * unguessable token rather than behind a session.
 *
 * It deliberately shows only what the client already knows: no internal notes,
 * no other bookings, no way to reach the rest of the system.
 */
export default async function PublicConfirmationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { locale, t } = await getT();

  const shoot = await getShootByToken(token);
  if (!shoot) notFound();

  // A cancelled booking is not a confirmation, and a pending one was never
  // confirmed in the first place.
  if (!["confirmed", "in_progress", "completed", "delivered"].includes(shoot.status)) {
    notFound();
  }

  const [assignments, settings] = await Promise.all([
    // Keyed by the same token, so possession of the link is the only thing
    // this page is trusting - and only the crew names come back, not the kit.
    assignmentsByToken(token),
    getSettings(),
  ]);

  const rows: [string, string][] = [
    [t.shoot.ref, shoot.ref],
    [t.shoot.client, shoot.clientName],
    [t.shoot.kind, shoot.kind ? t.shootKind[shoot.kind] : t.common.none],
    [t.shoot.scheduled, whenLine(shoot, locale)],
    [t.common.time, timezoneLabel(shoot.timezone, locale)],
    [t.shoot.setupMinutes, setupLine(shoot, locale)],
    [t.shoot.location, locationLine(shoot, locale)],
    [t.shoot.crew, crewLine(assignments, locale)],
    [t.shoot.reelsRequired, shoot.reelsRequired ? String(shoot.reelsRequired) : ""],
    [t.shoot.photosRequired, shoot.photosRequired ? String(shoot.photosRequired) : ""],
    [t.shoot.products, shoot.products ?? ""],
  ];

  return (
    <main className="relative z-10 mx-auto max-w-2xl px-5 py-14">
      <article className="print-block rounded-2xl border border-border bg-card p-8 sm:p-10">
        <header className="mb-8">
          <p className="font-display text-xl font-black tracking-tight">
            {settings.companyName}
          </p>
          <div className="mt-3 h-[3px] w-14 rounded-full hue-gradient" />
          <h1 className="mt-7 font-display text-2xl font-bold sm:text-3xl">
            {t.shoot.confirmation}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{shoot.title}</p>
        </header>

        <dl>
          {rows
            .filter(([, value]) => value && value !== t.common.none)
            .map(([label, value]) => (
              <div
                key={label}
                className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border py-3.5 last:border-0"
              >
                <dt className="w-40 shrink-0 text-sm text-muted-foreground">{label}</dt>
                <dd className="min-w-0 flex-1 text-sm font-medium">
                  {label === t.shoot.ref ? <span className="ltr tabular">{value}</span> : value}
                </dd>
              </div>
            ))}
        </dl>

        <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
          {locale === "ar"
            ? "التفاصيل دي هي المعتمدة للجلسة. لو حصل أي تعديل، هيوصلكم تأكيد جديد بنفس الشكل."
            : "These are the agreed details for this shoot. If anything changes, a new confirmation will follow in the same form."}
        </p>

        {settings.companyEmail || settings.companyPhone ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {settings.companyPhone ? <span className="ltr">{settings.companyPhone}</span> : null}
            {settings.companyPhone && settings.companyEmail ? " · " : null}
            {settings.companyEmail ? <span className="ltr">{settings.companyEmail}</span> : null}
          </p>
        ) : null}
      </article>
    </main>
  );
}
