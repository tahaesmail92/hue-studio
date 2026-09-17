import Link from "next/link";
import type { ShootStatus } from "@/lib/types";
import { Pill } from "./ui";

/**
 * Status colour, fixed in one place so the calendar, the lists and the detail
 * page never tell the same shoot two different stories.
 *
 * Only the three that carry real weight get colour: something needs you
 * (pending), something is settled (confirmed, delivered), something went away
 * (cancelled, rejected). Everything else stays muted so the page is not a
 * rainbow of equally loud badges.
 */
const TONE: Record<ShootStatus, "neutral" | "ok" | "warn" | "danger" | "brand"> = {
  pending: "warn",
  confirmed: "brand",
  in_progress: "brand",
  completed: "neutral",
  delivered: "ok",
  cancelled: "danger",
  rejected: "danger",
};

export function StatusPill({ status, label }: { status: ShootStatus; label: string }) {
  return <Pill tone={TONE[status]}>{label}</Pill>;
}

/** The same colour, as a background - used by the calendar cells. */
export const STATUS_DOT: Record<ShootStatus, string> = {
  pending: "bg-warning",
  confirmed: "bg-brand",
  in_progress: "bg-brand",
  completed: "bg-muted-foreground",
  delivered: "bg-success",
  cancelled: "bg-destructive",
  rejected: "bg-destructive",
};

/**
 * A reference number is Latin inside an Arabic sentence, so it is isolated -
 * otherwise a trailing character jumps to the wrong end of it.
 */
export function Ref({ value }: { value: string }) {
  return <span className="ltr tabular text-xs text-muted-foreground">{value}</span>;
}

export function ShootRow({
  href,
  reference,
  title,
  client,
  when,
  status,
  statusLabel,
}: {
  href: string;
  /** Not named `ref`: React reserves that prop name. */
  reference: string;
  title: string;
  client?: string;
  when: string;
  status: ShootStatus;
  statusLabel: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-5 py-4
                 transition last:border-0 hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <Ref value={reference} />
          {client ? <span>· {client}</span> : null}
        </p>
      </div>
      <span className="text-sm text-muted-foreground tabular">{when}</span>
      <StatusPill status={status} label={statusLabel} />
    </Link>
  );
}

/** Label and value, the shape every detail panel in the app uses. */
export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border py-3 last:border-0">
      <span className="w-40 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-sm font-medium">{children}</span>
    </div>
  );
}
