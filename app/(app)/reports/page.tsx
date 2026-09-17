import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { crewLoad, totals, volumeByClient } from "@/lib/db/repo/reports";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

type Range = "month" | "year" | "last30";

/** The three windows a producer actually asks for. */
function rangeFor(range: Range): { from: Date; to: Date } {
  const now = new Date();
  if (range === "year") {
    return {
      from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
      to: new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)),
    };
  }
  if (range === "last30") {
    return { from: new Date(now.getTime() - 30 * 86_400_000), to: now };
  }
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { ctx } = await requirePageRole("admin", "producer");
  const { t } = await getT();
  const { range: rangeParam } = await searchParams;

  const range: Range =
    rangeParam === "year" || rangeParam === "last30" ? rangeParam : "month";
  const { from, to } = rangeFor(range);

  const [summary, clients, crew] = await Promise.all([
    totals(ctx, from, to),
    volumeByClient(ctx, from, to),
    crewLoad(ctx, from, to),
  ]);

  const tabs: { key: Range; label: string }[] = [
    { key: "month", label: t.reports.thisMonth },
    { key: "last30", label: t.reports.last30 },
    { key: "year", label: t.reports.thisYear },
  ];

  return (
    <div className="hue-stagger">
      <PageHeader
        eyebrow={t.app.name}
        title={t.reports.title}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => (
              <LinkButton
                key={tab.key}
                href={`/reports?range=${tab.key}`}
                variant={tab.key === range ? "primary" : "secondary"}
              >
                {tab.label}
              </LinkButton>
            ))}
            <LinkButton href={`/reports/export?range=${range}`} variant="secondary">
              {t.reports.export}
            </LinkButton>
          </div>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.reports.requested} value={summary.requested} />
        <Stat label={t.reports.completionRate} value={`${summary.completionRate}%`} />
        <Stat
          label={t.reports.reshootRate}
          value={`${summary.reshootRate}%`}
          note={t.reports.reshootRateHint}
        />
        <Stat label={t.reports.cancelled} value={summary.cancelled + summary.rejected} muted />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <CardHeader title={t.reports.byClient} count={clients.length} />
          {clients.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t.reports.noData} body={t.reports.period} />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 text-start font-medium">{t.client.one}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t.shoot.many}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t.reports.completed}</th>
                  <th className="px-5 py-2.5 text-end font-medium">{t.reports.cancelled}</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((row) => (
                  <tr key={row.clientId} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">{row.clientName}</td>
                    <td className="px-3 py-3 text-end tabular">{row.shoots}</td>
                    <td className="px-3 py-3 text-end tabular">{row.completed}</td>
                    <td className="px-5 py-3 text-end tabular text-muted-foreground">
                      {row.cancelled}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-0">
          <CardHeader title={t.reports.crewLoad} count={crew.length} />
          {crew.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t.reports.noData} body={t.reports.period} />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 text-start font-medium">{t.common.name}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t.shoot.many}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t.reports.hours}</th>
                  <th className="px-5 py-2.5 text-end font-medium">{t.reports.reshoots}</th>
                </tr>
              </thead>
              <tbody>
                {crew.map((row) => (
                  <tr key={row.resourceId} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      {row.name}
                      {row.craft ? (
                        <span className="block text-xs text-muted-foreground">
                          {t.craft[row.craft as keyof typeof t.craft]}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-end tabular">{row.shoots}</td>
                    <td className="px-3 py-3 text-end tabular">{row.hours}</td>
                    {/* The number worth watching: work that had to be redone. */}
                    <td
                      className={`px-5 py-3 text-end tabular ${
                        row.reshoots > 0 ? "text-warning" : "text-muted-foreground"
                      }`}
                    >
                      {row.reshoots}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
