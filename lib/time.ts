// Scheduling happens in the client's timezone, not the browser's.
//
// An account manager in Cairo scheduling for a Riyadh clinic means 9am Riyadh,
// not 9am Cairo. A datetime-local input has no timezone at all, so these two
// functions carry the meaning across, using the offset the zone actually had
// at that instant - which is what makes DST changes come out right.

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Intl renders midnight as 24 in some locales/zones.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return asIfUtc - instant.getTime();
}

/**
 * "2026-09-05T14:30" read in `timeZone` -> the real instant.
 *
 * The offset is applied twice: the first pass uses the offset at the wrong
 * instant, which is only wrong within an hour or two, and the second pass
 * corrects it. That is what keeps a time an hour either side of a DST
 * boundary from landing in the wrong hour.
 */
export function zonedToInstant(local: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;

  const naive = new Date(`${local}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;

  let instant = new Date(naive.getTime() - zoneOffsetMs(naive, timeZone));
  instant = new Date(naive.getTime() - zoneOffsetMs(instant, timeZone));
  return instant;
}

/** The inverse: an instant rendered as a datetime-local value in `timeZone`. */
export function instantToZoned(instant: Date | null, timeZone: string): string {
  if (!instant) return "";
  const shifted = new Date(instant.getTime() + zoneOffsetMs(instant, timeZone));
  return shifted.toISOString().slice(0, 16);
}

/** For display: "05 Sep 2026, 14:30" in the client's own zone. */
export function formatInZone(instant: Date | null, timeZone: string): string {
  if (!instant) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

/** Calendar helpers: the month a date belongs to, as a UTC half-open range. */
export function monthRange(year: number, month: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, month, 1)),
    to: new Date(Date.UTC(year, month + 1, 1)),
  };
}

/** Sunday-first weeks, which is how the calendar reads in the Gulf. */
export function calendarGrid(year: number, month: number): Date[] {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    days.push(day);
  }
  return days;
}

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
