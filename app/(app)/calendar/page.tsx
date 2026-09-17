import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { listShoots } from "@/lib/db/repo/shoots";
import { listBlackouts } from "@/lib/db/repo/settings";
import { calendarGrid, isoDay, monthRange } from "@/lib/time";
import { STATUS_DOT } from "@/components/shoot-bits";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

function parseMonth(value: string | undefined): { year: number; month: number } {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  if (!match) return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  return { year: Number(match[1]), month: Number(match[2]) - 1 };
}

function monthParam(year: number, month: number): string {
  const shifted = new Date(Date.UTC(year, month, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { ctx } = await requirePageRole("admin", "producer");
  const { t } = await getT();
  const { month: monthParamValue } = await searchParams;
  const { year, month } = parseMonth(monthParamValue);

  const { from, to } = monthRange(year, month);
  const [shoots, blackouts] = await Promise.all([
    listShoots(ctx, { from, to, limit: 500 }),
    listBlackouts(isoDay(from), isoDay(to)),
  ]);

  // Only scheduled shoots appear on a calendar; a pending request with no
  // agreed date has no square to sit in and belongs on the requests page.
  const byDay = new Map<string, typeof shoots>();
  for (const shoot of shoots) {
    if (!shoot.startsAt) continue;
    const key = isoDay(shoot.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), shoot]);
  }
  const closed = new Set(blackouts.map((b) => b.day));

  const days = calendarGrid(year, month);
  const today = isoDay(new Date());

  return (
    <div className="hue-stagger">
      <PageHeader
        eyebrow={t.app.name}
        title={t.calendar.title}
        subtitle={`${t.month[String(month) as keyof typeof t.month]} ${year}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={`/calendar?month=${monthParam(year, month - 1)}`} variant="secondary">
              {t.common.previous}
            </LinkButton>
            <LinkButton href="/calendar" variant="secondary">
              {t.common.today}
            </LinkButton>
            <LinkButton href={`/calendar?month=${monthParam(year, month + 1)}`} variant="secondary">
              {t.common.next}
            </LinkButton>
            <LinkButton href="/schedule">{t.calendar.resourceTimeline}</LinkButton>
          </div>
        }
      />

      <Card className="p-0">
        {/* Sunday-first, which is how the week reads in Cairo and Riyadh. */}
        <div className="grid grid-cols-7 border-b border-border">
          {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
            <div
              key={weekday}
              className="px-2 py-3 text-center text-xs font-medium text-muted-foreground"
            >
              {t.weekdayShort[String(weekday) as keyof typeof t.weekdayShort]}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = isoDay(day);
            const items = byDay.get(key) ?? [];
            const inMonth = day.getUTCMonth() === month;

            return (
              <div
                key={key}
                className={`min-h-24 border-b border-e border-border p-2 last:border-e-0 ${
                  inMonth ? "" : "bg-muted/30"
                } ${closed.has(key) ? "bg-destructive/[0.03]" : ""}`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span
                    className={`text-xs tabular ${
                      key === today
                        ? "rounded-full bg-brand px-1.5 py-0.5 font-semibold text-primary-foreground"
                        : inMonth
                          ? "text-muted-foreground"
                          : "text-muted-foreground/50"
                    }`}
                  >
                    {day.getUTCDate()}
                  </span>
                  {closed.has(key) ? (
                    <span className="text-[10px] text-destructive">{t.settings.closed}</span>
                  ) : null}
                </div>

                <div className="space-y-1">
                  {items.map((shoot) => (
                    <Link
                      key={shoot.id}
                      href={`/requests/${shoot.id}`}
                      title={`${shoot.clientName} — ${shoot.title}`}
                      className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px]
                                 transition hover:bg-muted"
                    >
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[shoot.status]}`}
                        aria-hidden
                      />
                      <span className="truncate">{shoot.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {shoots.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t.calendar.noneThisMonth} body={t.dashboard.allClear} />
        </div>
      ) : null}
    </div>
  );
}
