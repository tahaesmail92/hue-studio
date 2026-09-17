import { query, one } from "../index.ts";
import type { Ctx } from "../../types.ts";
import { assertStaff } from "../../types.ts";

export type Period = "day" | "week" | "month" | "year";

export type ClientVolume = {
  clientId: string;
  clientName: string;
  shoots: number;
  completed: number;
  cancelled: number;
};

/** Shoots per client in a window - the spec's per-client report. */
export async function volumeByClient(
  ctx: Ctx,
  from: Date,
  to: Date,
): Promise<ClientVolume[]> {
  assertStaff(ctx);
  const rows = await query<{
    clientId: string; clientName: string;
    shoots: string; completed: string; cancelled: string;
  }>(
    `select c.id as "clientId", c.name as "clientName",
            count(*)::text as shoots,
            count(*) filter (where s.status in ('completed','delivered'))::text as completed,
            count(*) filter (where s.status in ('cancelled','rejected'))::text as cancelled
       from shoots s
       join clients c on c.id = s.client_id
      where coalesce(s.starts_at, s.created_at) >= $1
        and coalesce(s.starts_at, s.created_at) <  $2
      group by 1, 2
      order by count(*) desc, c.name`,
    [from, to],
  );
  return rows.map((r) => ({
    clientId: r.clientId,
    clientName: r.clientName,
    shoots: Number(r.shoots),
    completed: Number(r.completed),
    cancelled: Number(r.cancelled),
  }));
}

export type CrewLoad = {
  resourceId: string;
  name: string;
  craft: string | null;
  shoots: number;
  hours: number;
  reshoots: number;
};

/**
 * How loaded each person is, and how often their work had to be redone.
 *
 * The reshoot count is the reason `parent_shoot_id` exists: it is the only
 * quality signal in the system that is not somebody's opinion.
 */
export async function crewLoad(ctx: Ctx, from: Date, to: Date): Promise<CrewLoad[]> {
  assertStaff(ctx);
  const rows = await query<{
    resourceId: string; name: string; craft: string | null;
    shoots: string; hours: string; reshoots: string;
  }>(
    `select r.id as "resourceId", r.name, r.craft::text as craft,
            count(*)::text as shoots,
            coalesce(sum(extract(epoch from (sr.ends_at - sr.starts_at)) / 3600), 0)::text as hours,
            count(*) filter (where s.parent_shoot_id is not null)::text as reshoots
       from shoot_resources sr
       join resources r on r.id = sr.resource_id
       join shoots    s on s.id = sr.shoot_id
      where r.kind = 'person'
        and sr.starts_at >= $1 and sr.starts_at < $2
        and s.status not in ('cancelled', 'rejected')
      group by 1, 2, 3
      order by count(*) desc, r.name`,
    [from, to],
  );
  return rows.map((r) => ({
    resourceId: r.resourceId,
    name: r.name,
    craft: r.craft,
    shoots: Number(r.shoots),
    hours: Math.round(Number(r.hours) * 10) / 10,
    reshoots: Number(r.reshoots),
  }));
}

export type Totals = {
  requested: number;
  confirmed: number;
  completed: number;
  delivered: number;
  cancelled: number;
  rejected: number;
  /** Delivered as a share of everything that was not cancelled or rejected. */
  completionRate: number;
  reshootRate: number;
};

export async function totals(ctx: Ctx, from: Date, to: Date): Promise<Totals> {
  assertStaff(ctx);
  const row = await one<Record<string, string>>(
    `select count(*)::text as requested,
            count(*) filter (where status = 'confirmed')::text as confirmed,
            count(*) filter (where status = 'completed')::text as completed,
            count(*) filter (where status = 'delivered')::text as delivered,
            count(*) filter (where status = 'cancelled')::text as cancelled,
            count(*) filter (where status = 'rejected')::text as rejected,
            count(*) filter (where parent_shoot_id is not null)::text as reshoots
       from shoots
      where coalesce(starts_at, created_at) >= $1
        and coalesce(starts_at, created_at) <  $2`,
    [from, to],
  );

  const n = (key: string) => Number(row?.[key] ?? 0);
  const requested = n("requested");
  const lost = n("cancelled") + n("rejected");
  const live = requested - lost;

  return {
    requested,
    confirmed: n("confirmed"),
    completed: n("completed"),
    delivered: n("delivered"),
    cancelled: n("cancelled"),
    rejected: n("rejected"),
    completionRate: live > 0 ? Math.round((n("delivered") / live) * 100) : 0,
    reshootRate: requested > 0 ? Math.round((n("reshoots") / requested) * 100) : 0,
  };
}

/** Counts per bucket, for the trend strip. */
export async function volumeOverTime(
  ctx: Ctx,
  from: Date,
  to: Date,
  period: Period,
): Promise<{ bucket: string; count: number }[]> {
  assertStaff(ctx);
  // The period is one of four literals, never user text - it is interpolated
  // because date_trunc's first argument cannot be a bind parameter.
  const unit: Period = (["day", "week", "month", "year"] as Period[]).includes(period)
    ? period
    : "month";

  const rows = await query<{ bucket: string; count: string }>(
    `select to_char(date_trunc('${unit}', coalesce(starts_at, created_at)), 'YYYY-MM-DD') as bucket,
            count(*)::text as count
       from shoots
      where coalesce(starts_at, created_at) >= $1
        and coalesce(starts_at, created_at) <  $2
        and status not in ('cancelled', 'rejected')
      group by 1 order by 1`,
    [from, to],
  );
  return rows.map((r) => ({ bucket: r.bucket, count: Number(r.count) }));
}
