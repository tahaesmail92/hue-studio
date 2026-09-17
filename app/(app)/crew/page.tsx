import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { listShoots } from "@/lib/db/repo/shoots";
import { whenLine } from "@/lib/shoot-view";
import { ShootRow } from "@/components/shoot-bits";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CrewSchedulePage() {
  const { ctx } = await requirePageRole("crew");
  const { locale, t } = await getT();

  // listShoots scopes crew to what they are actually booked on - a freelance
  // operator never sees the agency's whole client list.
  //
  // The split is two queries rather than one filtered in the component: with a
  // single limited list, a crew member with a long history would see their
  // next shoot pushed off the end by shoots they have already done.
  const now = new Date();
  const horizon = new Date(now.getTime() + 180 * 86_400_000);

  const [upcomingAll, shoots] = await Promise.all([
    listShoots(ctx, { from: now, to: horizon, limit: 50 }),
    listShoots(ctx, { limit: 60 }),
  ]);

  const upcoming = upcomingAll.filter((s) => !["cancelled", "rejected"].includes(s.status));
  const upcomingIds = new Set(upcoming.map((s) => s.id));
  const done = shoots.filter((s) => !upcomingIds.has(s.id));

  return (
    <div className="hue-stagger">
      <PageHeader eyebrow={t.app.name} title={t.crewPage.myShoots} />

      <Card className="mb-6 p-0">
        <CardHeader title={t.dashboard.upcoming} count={upcoming.length} />
        {upcoming.length === 0 ? (
          <div className="p-6">
            <EmptyState title={t.crewPage.noShoots} body={t.dashboard.nothingToday} />
          </div>
        ) : (
          upcoming.map((shoot) => (
            <ShootRow
              key={shoot.id}
              href={`/crew/${shoot.id}`}
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

      {done.length > 0 ? (
        <Card className="p-0">
          <CardHeader title={t.shoot.many} count={done.length} />
          {done.map((shoot) => (
            <ShootRow
              key={shoot.id}
              href={`/crew/${shoot.id}`}
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
