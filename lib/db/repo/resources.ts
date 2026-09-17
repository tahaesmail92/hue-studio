import { one, query } from "../index.ts";
import type { Craft, Ctx, ResourceKind } from "../../types.ts";
import { assertStaff } from "../../types.ts";

export type Resource = {
  id: string;
  kind: ResourceKind;
  name: string;
  userId: string | null;
  craft: Craft | null;
  notes: string | null;
  active: boolean;
};

const COLUMNS = `id, kind, name, user_id as "userId", craft, notes, active`;

export async function listResources(ctx: Ctx, kind?: ResourceKind): Promise<Resource[]> {
  assertStaff(ctx);
  if (kind) {
    return query<Resource>(
      `select ${COLUMNS} from resources where kind = $1 order by active desc, name`,
      [kind],
    );
  }
  return query<Resource>(
    // People first, then studios, then kit: the order a producer thinks in.
    `select ${COLUMNS} from resources
      order by active desc,
               array_position(array['person','studio','equipment']::resource_kind[], kind),
               name`,
  );
}

export async function bookableResources(ctx: Ctx): Promise<Resource[]> {
  assertStaff(ctx);
  return query<Resource>(
    `select ${COLUMNS} from resources where active
      order by array_position(array['person','studio','equipment']::resource_kind[], kind), name`,
  );
}

export async function getResource(ctx: Ctx, id: string): Promise<Resource | null> {
  assertStaff(ctx);
  return one<Resource>(`select ${COLUMNS} from resources where id = $1`, [id]);
}

export async function createResource(
  ctx: Ctx,
  input: { kind: ResourceKind; name: string; craft?: Craft | null; notes?: string | null },
): Promise<Resource> {
  assertStaff(ctx);
  const row = await one<Resource>(
    `insert into resources (kind, name, craft, notes)
     values ($1::resource_kind, $2, $3::craft, $4)
     returning ${COLUMNS}`,
    [input.kind, input.name.trim(), input.kind === "person" ? input.craft ?? null : null,
     input.notes ?? null],
  );
  return row!;
}

export async function updateResource(
  ctx: Ctx,
  id: string,
  patch: { name?: string; craft?: Craft | null; notes?: string | null; active?: boolean },
): Promise<void> {
  assertStaff(ctx);
  await query(
    `update resources set
       name   = coalesce($2, name),
       craft  = coalesce($3::craft, craft),
       notes  = coalesce($4, notes),
       active = coalesce($5, active)
     where id = $1`,
    [id, patch.name ?? null, patch.craft ?? null, patch.notes ?? null, patch.active ?? null],
  );
}

/**
 * Resources are retired, never deleted: every shoot they were booked on still
 * references them, and that history is the point of keeping records at all.
 */
export async function retireResource(ctx: Ctx, id: string): Promise<void> {
  assertStaff(ctx);
  await query("update resources set active = false where id = $1", [id]);
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export type Clash = {
  resourceId: string;
  resourceName: string;
  shootId: string;
  shootRef: string;
  shootTitle: string;
  startsAt: Date;
  endsAt: Date;
};

/**
 * Who is already busy in this window. The exclusion constraint in 0004 is what
 * actually prevents a clash; this exists so the producer is told *who* and *on
 * what* before they hit save, instead of being handed a database error.
 *
 * `exceptShootId` lets a shoot be edited without colliding with itself.
 */
export async function findClashes(
  ctx: Ctx,
  input: { resourceIds: string[]; startsAt: Date; endsAt: Date; exceptShootId?: string | null },
): Promise<Clash[]> {
  assertStaff(ctx);
  if (input.resourceIds.length === 0) return [];

  return query<Clash>(
    `select sr.resource_id as "resourceId",
            r.name         as "resourceName",
            s.id           as "shootId",
            s.ref          as "shootRef",
            s.title        as "shootTitle",
            sr.starts_at   as "startsAt",
            sr.ends_at     as "endsAt"
       from shoot_resources sr
       join resources r on r.id = sr.resource_id
       join shoots    s on s.id = sr.shoot_id
      where sr.blocking
        and sr.resource_id = any($1)
        and sr.during && tstzrange($2, $3, '[)')
        and ($4::uuid is null or sr.shoot_id <> $4)
      order by sr.starts_at`,
    [input.resourceIds, input.startsAt, input.endsAt, input.exceptShootId ?? null],
  );
}

export type ResourceDay = {
  resourceId: string;
  resourceName: string;
  kind: ResourceKind;
  shootId: string;
  shootRef: string;
  shootTitle: string;
  clientName: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
};

/** Everything booked between two instants - the resource timeline's data. */
export async function bookingsBetween(
  ctx: Ctx,
  from: Date,
  to: Date,
): Promise<ResourceDay[]> {
  assertStaff(ctx);
  return query<ResourceDay>(
    `select sr.resource_id as "resourceId",
            r.name         as "resourceName",
            r.kind,
            s.id           as "shootId",
            s.ref          as "shootRef",
            s.title        as "shootTitle",
            c.name         as "clientName",
            s.status::text as status,
            sr.starts_at   as "startsAt",
            sr.ends_at     as "endsAt"
       from shoot_resources sr
       join resources r on r.id = sr.resource_id
       join shoots    s on s.id = sr.shoot_id
       join clients   c on c.id = s.client_id
      where sr.during && tstzrange($1, $2, '[)')
        and s.status not in ('cancelled', 'rejected')
      order by r.kind, r.name, sr.starts_at`,
    [from, to],
  );
}
