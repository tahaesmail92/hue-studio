import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { listClients, visitCounts } from "@/lib/db/repo/clients";
import { listShoots } from "@/lib/db/repo/shoots";
import { whenLine } from "@/lib/shoot-view";
import { ShootRow } from "@/components/shoot-bits";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const { ctx } = await requirePageRole("client");
  const { locale, t } = await getT();

  const [shoots, clients] = await Promise.all([listShoots(ctx), listClients(ctx)]);

  // A client belonging to one company - the normal case - sees their own
  // counter. With several, a combined number would be meaningless.
  const counts = clients.length === 1 ? await visitCounts(ctx, clients[0].id) : null;

  const open = shoots.filter((s) => !["cancelled", "rejected", "delivered"].includes(s.status));
  const past = shoots.filter((s) => ["cancelled", "rejected", "delivered"].includes(s.status));

  return (
    <div className="hue-stagger">
      <PageHeader
        eyebrow={clients.map((c) => c.name).join("، ")}
        title={t.nav.myShoots}
        action={<LinkButton href="/portal/new">{t.nav.newRequest}</LinkButton>}
      />

      {counts ? (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t.client.visitsWeek} value={counts.week} />
          <Stat label={t.client.visitsMonth} value={counts.month} />
          <Stat label={t.client.visitsYear} value={counts.year} />
          <Stat label={t.common.total} value={shoots.length} muted />
        </div>
      ) : null}

      <Card className="mb-6 p-0">
        <CardHeader title={t.dashboard.upcoming} count={open.length} />
        {open.length === 0 ? (
          <div className="p-6">
            <EmptyState title={t.shoot.noShoots} body={t.shoot.briefHint} />
          </div>
        ) : (
          open.map((shoot) => (
            <ShootRow
              key={shoot.id}
              href={`/portal/${shoot.id}`}
              reference={shoot.ref}
              title={shoot.title}
              when={whenLine(shoot, locale)}
              status={shoot.status}
              statusLabel={t.shootStatus[shoot.status]}
            />
          ))
        )}
      </Card>

      {past.length > 0 ? (
        <Card className="p-0">
          <CardHeader title={t.shoot.many} count={past.length} />
          {past.map((shoot) => (
            <ShootRow
              key={shoot.id}
              href={`/portal/${shoot.id}`}
              reference={shoot.ref}
              title={shoot.title}
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
