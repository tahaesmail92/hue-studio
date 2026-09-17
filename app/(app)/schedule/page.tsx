import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { bookableResources, bookingsBetween } from "@/lib/db/repo/resources";
import { STATUS_DOT } from "@/components/shoot-bits";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import type { ShootStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

// A studio day. Anything outside it is rare enough to be worth reading as an
// overflow rather than widening every row to 24 columns.
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 23;
const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, index) => DAY_START_HOUR + index,
);

function parseDay(value: string | undefined): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "")
    ? (value as string)
    : new Date().toISOString().slice(0, 10);
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * The resource timeline: one row per resource, hours across.
 *
 * This is the view that makes a clash visible rather than merely prevented -
 * the database already refuses to double-book, but a producer planning a week
 * needs to SEE where the gaps are, and a month grid cannot show that.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const { ctx } = await requirePageRole("admin", "producer");
  const { t } = await getT();
  const { day: dayParam } = await searchParams;
  const day = parseDay(dayParam);

  const from = new Date(`${day}T00:00:00Z`);
  const to = new Date(from.getTime() + 86_400_000);

  const [resources, bookings] = await Promise.all([
    bookableResources(ctx),
    bookingsBetween(ctx, from, to),
  ]);

  const byResource = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    byResource.set(booking.resourceId, [...(byResource.get(booking.resourceId) ?? []), booking]);
  }

  // Bars are positioned as a percentage of the visible window, which keeps the
  // whole thing pure CSS - no measuring, no client component, no layout shift.
  const windowMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  function bar(startsAt: Date, endsAt: Date) {
    const dayStart = new Date(`${day}T00:00:00Z`).getTime() + DAY_START_HOUR * 3_600_000;
    const startMinutes = (startsAt.getTime() - dayStart) / 60_000;
    const endMinutes = (endsAt.getTime() - dayStart) / 60_000;

    // Clamped so a booking that starts before the window still shows a stub at
    // the edge instead of vanishing.
    const left = Math.max(0, Math.min(100, (startMinutes / windowMinutes) * 100));
    const right = Math.max(0, Math.min(100, (endMinutes / windowMinutes) * 100));
    return { insetInlineStart: `${left}%`, width: `${Math.max(right - left, 1.5)}%` };
  }

  return (
    <div className="hue-stagger">
      <PageHeader
        eyebrow={t.app.name}
        title={t.calendar.resourceTimeline}
        subtitle={t.calendar.timelineHint}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={`/schedule?day=${shiftDay(day, -1)}`} variant="secondary">
              {t.common.previous}
            </LinkButton>
            <LinkButton href="/schedule" variant="secondary">
              {t.common.today}
            </LinkButton>
            <LinkButton href={`/schedule?day=${shiftDay(day, 1)}`} variant="secondary">
              {t.common.next}
            </LinkButton>
            <LinkButton href="/calendar">{t.calendar.monthView}</LinkButton>
          </div>
        }
      />

      <p className="mb-4 text-sm text-muted-foreground tabular">{day}</p>

      {resources.length === 0 ? (
        <EmptyState title={t.resource.none} body={t.resource.hint} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <div className="min-w-[760px]">
            <div className="flex border-b border-border">
              <div className="w-44 shrink-0 px-4 py-2 text-xs text-muted-foreground">
                {t.resource.many}
              </div>
              <div className="relative flex-1">
                <div className="flex">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="flex-1 border-s border-border px-1 py-2 text-center text-[10px]
                                 text-muted-foreground tabular"
                    >
                      {String(hour).padStart(2, "0")}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {resources.map((resource) => {
              const items = byResource.get(resource.id) ?? [];
              return (
                <div key={resource.id} className="flex border-b border-border last:border-0">
                  <div className="w-44 shrink-0 px-4 py-3">
                    <p className="truncate text-sm font-medium">{resource.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {resource.craft ? t.craft[resource.craft] : t.resourceKind[resource.kind]}
                    </p>
                  </div>

                  <div className="relative min-h-14 flex-1">
                    {/* Hour gridlines, drawn behind the bars. */}
                    <div className="absolute inset-0 flex" aria-hidden>
                      {HOURS.map((hour) => (
                        <div key={hour} className="flex-1 border-s border-border/60" />
                      ))}
                    </div>

                    {items.length === 0 ? (
                      <span className="absolute inset-y-0 start-2 flex items-center text-[11px]
                                       text-muted-foreground/60">
                        {t.calendar.free}
                      </span>
                    ) : null}

                    {items.map((booking) => (
                      <Link
                        key={`${booking.shootId}-${booking.resourceId}`}
                        href={`/requests/${booking.shootId}`}
                        title={`${booking.clientName} — ${booking.shootTitle}`}
                        style={bar(booking.startsAt, booking.endsAt)}
                        className={`absolute top-2 bottom-2 flex items-center overflow-hidden
                                    rounded-md px-2 text-[11px] font-medium text-white
                                    transition hover:opacity-90
                                    ${STATUS_DOT[booking.status as ShootStatus]}`}
                      >
                        <span className="truncate">{booking.shootTitle}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
