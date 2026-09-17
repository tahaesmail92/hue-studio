import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { homeFor, requireCtx } from "@/lib/auth/session";
import { listShoots } from "@/lib/db/repo/shoots";
import { totals } from "@/lib/db/repo/reports";
import { monthRange } from "@/lib/time";
import { whenLine } from "@/lib/shoot-view";
import { ShootRow } from "@/components/shoot-bits";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { ctx, user } = await requireCtx();
  // Clients and crew have their own home; landing here means a stale bookmark.
  if (user.role === "client" || user.role === "crew") redirect(homeFor(user.role));

  const { locale, t } = await getT();

  const now = new Date();
  const { from, to } = monthRange(now.getUTCFullYear(), now.getUTCMonth());
  const dayStart = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const [pending, today, upcoming, awaiting, month] = await Promise.all([
    listShoots(ctx, { status: ["pending"] }),
    listShoots(ctx, { from: dayStart, to: dayEnd }),
    listShoots(ctx, { status: ["confirmed"], from: dayEnd, to: new Date(dayEnd.getTime() + 14 * 86_400_000) }),
    listShoots(ctx, { status: ["completed"] }),
    totals(ctx, from, to),
  ]);

  return (
    <div className="hue-stagger">
      <PageHeader
        eyebrow={t.app.tagline}
        title={t.nav.dashboard}
        action={<LinkButton href="/calendar">{t.calendar.title}</LinkButton>}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.dashboard.pendingRequests} value={pending.length} />
        <Stat label={t.dashboard.todayShoots} value={today.length} />
        <Stat label={t.dashboard.awaitingDelivery} value={awaiting.length} />
        <Stat label={t.dashboard.thisMonth} value={month.requested} muted />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <CardHeader title={t.dashboard.pendingRequests} count={pending.length} />
          {pending.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t.dashboard.allClear} body={t.shoot.briefHint} />
            </div>
          ) : (
            pending.map((shoot) => (
              <ShootRow
                key={shoot.id}
                href={`/requests/${shoot.id}`}
                reference={shoot.ref}
                title={shoot.title}
                client={shoot.clientName}
                when={whenLine(shoot, locale)}
                status={shoot.status}
                statusLabel={t.shootStatus[shoot.status]}
              />
            ))
          )}
        </Card>

        <Card className="p-0">
          <CardHeader title={t.dashboard.todayShoots} count={today.length} />
          {today.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t.dashboard.nothingToday} body={t.dashboard.upcoming} />
            </div>
          ) : (
            today.map((shoot) => (
              <ShootRow
                key={shoot.id}
                href={`/requests/${shoot.id}`}
                reference={shoot.ref}
                title={shoot.title}
                client={shoot.clientName}
                when={whenLine(shoot, locale)}
                status={shoot.status}
                statusLabel={t.shootStatus[shoot.status]}
              />
            ))
          )}
        </Card>
      </div>

      {upcoming.length > 0 ? (
        <Card className="mt-6 p-0">
          <CardHeader title={t.dashboard.upcoming} count={upcoming.length} />
          {upcoming.map((shoot) => (
            <ShootRow
              key={shoot.id}
              href={`/requests/${shoot.id}`}
              reference={shoot.ref}
              title={shoot.title}
              client={shoot.clientName}
              when={whenLine(shoot, locale)}
              status={shoot.status}
              statusLabel={t.shootStatus[shoot.status]}
            />
          ))}
        </Card>
      ) : null}
    </div>
  );
}
