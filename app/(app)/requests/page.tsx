import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { listShoots } from "@/lib/db/repo/shoots";
import { whenLine } from "@/lib/shoot-view";
import { ShootRow } from "@/components/shoot-bits";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import type { ShootStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { ctx } = await requirePageRole("admin", "producer");
  const { locale, t } = await getT();
  const { status } = await searchParams;

  const filter: ShootStatus[] | undefined =
    status && status !== "all" ? ([status] as ShootStatus[]) : undefined;

  const [pending, everything] = await Promise.all([
    listShoots(ctx, { status: ["pending"] }),
    listShoots(ctx, { status: filter, limit: 100 }),
  ]);

  // Pending requests are pulled out of the list rather than left in it: the
  // whole job of this page is "what needs me", and a queue of one mixed into
  // ninety finished shoots is a queue you stop checking.
  const rest = everything.filter((shoot) => shoot.status !== "pending");

  return (
    <div className="hue-stagger">
      <PageHeader eyebrow={t.app.name} title={t.nav.requests} />

      <Card className="mb-6 p-0">
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
        <CardHeader title={t.shoot.many} count={rest.length} />
        {rest.length === 0 ? (
          <div className="p-6">
            <EmptyState title={t.shoot.noShoots} body={t.shoot.briefHint} />
          </div>
        ) : (
          rest.map((shoot) => (
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
  );
}
