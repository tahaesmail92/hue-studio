import { one, query, tx } from "../index.ts";
import type {
  Ctx,
  LocationKind,
  ShootEventType,
  ShootKind,
  ShootStatus,
} from "../../types.ts";
import { assertClientAccess, assertStaff, ForbiddenError } from "../../types.ts";

export type Shoot = {
  id: string;
  ref: string;
  clientId: string;
  clientName: string;
  clientTimezone: string;
  title: string;
  kind: ShootKind | null;
  status: ShootStatus;
  parentShootId: string | null;
  parentRef: string | null;
  reshootReason: string | null;
  requestedDate: string | null;
  requestedTime: string | null;
  requestedNotes: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  setupMinutes: number;
  teardownMinutes: number;
  timezone: string;
  locationKind: LocationKind | null;
  locationResourceId: string | null;
  locationName: string | null;
  address: string | null;
  mapUrl: string | null;
  cameraCount: number | null;
  reelsRequired: number | null;
  photosRequired: number | null;
  products: string | null;
  moodboardUrl: string | null;
  notes: string | null;
  confirmToken: string;
  confirmedAt: Date | null;
  createdBy: string;
  cancelledReason: string | null;
  createdAt: Date;
};

const SELECT = `
  select s.id, s.ref, s.client_id as "clientId",
         c.name as "clientName", c.timezone as "clientTimezone",
         s.title, s.kind, s.status,
         s.parent_shoot_id as "parentShootId", p.ref as "parentRef",
         s.reshoot_reason as "reshootReason",
         s.requested_date as "requestedDate", s.requested_time as "requestedTime",
         s.requested_notes as "requestedNotes",
         s.starts_at as "startsAt", s.ends_at as "endsAt",
         s.setup_minutes as "setupMinutes", s.teardown_minutes as "teardownMinutes",
         s.timezone,
         s.location_kind as "locationKind",
         s.location_resource_id as "locationResourceId", lr.name as "locationName",
         s.address, s.map_url as "mapUrl",
         s.camera_count as "cameraCount", s.reels_required as "reelsRequired",
         s.photos_required as "photosRequired",
         s.products, s.moodboard_url as "moodboardUrl", s.notes,
         s.confirm_token as "confirmToken",
         s.confirmed_at as "confirmedAt", s.created_by as "createdBy",
         s.cancelled_reason as "cancelledReason", s.created_at as "createdAt"
    from shoots s
    join clients c on c.id = s.client_id
    left join shoots p on p.id = s.parent_shoot_id
    left join resources lr on lr.id = s.location_resource_id`;

/**
 * The scope clause every list read appends.
 *
 * Staff see everything. A client sees their own companies' shoots. Crew see
 * only what they are actually booked on - not every shoot, which would leak
 * the agency's whole client list to a freelance camera operator.
 */
function scope(ctx: Ctx, params: unknown[]): string {
  if (ctx.allClients) return "true";
  if (ctx.role === "client") {
    params.push(ctx.clientIds);
    return `s.client_id = any($${params.length})`;
  }
  params.push(ctx.resourceId);
  return `exists (select 1 from shoot_resources sr
                   where sr.shoot_id = s.id and sr.resource_id = $${params.length})`;
}

export type ShootFilter = {
  status?: ShootStatus[];
  clientId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
};

export async function listShoots(ctx: Ctx, filter: ShootFilter = {}): Promise<Shoot[]> {
  const params: unknown[] = [];
  const where = [scope(ctx, params)];

  if (filter.status?.length) {
    params.push(filter.status);
    where.push(`s.status = any($${params.length}::shoot_status[])`);
  }
  if (filter.clientId) {
    assertClientAccess(ctx, filter.clientId);
    params.push(filter.clientId);
    where.push(`s.client_id = $${params.length}`);
  }
  if (filter.from && filter.to) {
    params.push(filter.from, filter.to);
    where.push(`s.starts_at >= $${params.length - 1} and s.starts_at < $${params.length}`);
  }
  params.push(filter.limit ?? 200);

  return query<Shoot>(
    `${SELECT} where ${where.join(" and ")}
      order by coalesce(s.starts_at, s.created_at) desc
      limit $${params.length}`,
    params,
  );
}

export async function getShoot(ctx: Ctx, id: string): Promise<Shoot | null> {
  const params: unknown[] = [id];
  const visible = scope(ctx, params);
  return one<Shoot>(`${SELECT} where s.id = $1 and ${visible}`, params);
}

/** The public confirmation page: an unguessable token instead of a session. */
export async function getShootByToken(token: string): Promise<Shoot | null> {
  return one<Shoot>(`${SELECT} where s.confirm_token = $1`, [token]);
}

/**
 * For the worker, which has no session and therefore no Ctx.
 *
 * Named so that is impossible to miss at the call site: nothing in the request
 * path should reach for this instead of the scoped `getShoot`.
 */
export async function getShootUnscoped(id: string): Promise<Shoot | null> {
  return one<Shoot>(`${SELECT} where s.id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Creating a request
// ---------------------------------------------------------------------------

export type NewShoot = {
  clientId: string;
  title: string;
  kind?: ShootKind | null;
  requestedDate?: string | null;
  requestedTime?: string | null;
  requestedNotes?: string | null;
  locationKind?: LocationKind | null;
  address?: string | null;
  cameraCount?: number | null;
  reelsRequired?: number | null;
  photosRequired?: number | null;
  products?: string | null;
  moodboardUrl?: string | null;
  notes?: string | null;
  parentShootId?: string | null;
  reshootReason?: string | null;
};

/**
 * Only `title` is required, per the spec. A half-filled request that arrives
 * is worth more than a complete one the client gave up on, and the producer
 * fills the rest in at approval time anyway.
 */
export async function createShoot(ctx: Ctx, input: NewShoot): Promise<Shoot> {
  assertClientAccess(ctx, input.clientId);

  const created = await tx(async (client) => {
    const row = await client.query<{ id: string }>(
      `insert into shoots (
         client_id, created_by, title, kind, timezone,
         requested_date, requested_time, requested_notes,
         location_kind, address, camera_count, reels_required, photos_required,
         products, moodboard_url, notes, parent_shoot_id, reshoot_reason)
       values ($1, $2, $3, $4::shoot_kind,
               (select timezone from clients where id = $1),
               $5, $6, $7, $8::location_kind, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       returning id`,
      [
        input.clientId, ctx.userId, input.title.trim(), input.kind ?? null,
        input.requestedDate ?? null, input.requestedTime ?? null, input.requestedNotes ?? null,
        input.locationKind ?? null, input.address ?? null,
        input.cameraCount ?? null, input.reelsRequired ?? null, input.photosRequired ?? null,
        input.products ?? null, input.moodboardUrl ?? null, input.notes ?? null,
        input.parentShootId ?? null, input.reshootReason ?? null,
      ],
    );
    const id = row.rows[0].id;
    await client.query(
      `insert into shoot_events (shoot_id, actor_id, type) values ($1, $2, 'created')`,
      [id, ctx.userId],
    );
    return id;
  });

  return (await getShoot(ctx, created))!;
}

// ---------------------------------------------------------------------------
// Approval and rescheduling
//
// Postgres raises 23P01 when a confirmation would double-book. It is caught
// here and turned into something the producer can act on, naming who is busy.
// ---------------------------------------------------------------------------

export class ConflictError extends Error {
  constructor() {
    super("One of the chosen resources is already booked in this window.");
    this.name = "ConflictError";
  }
}

function isExclusionViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23P01";
}

export type Schedule = {
  startsAt: Date;
  endsAt: Date;
  setupMinutes?: number;
  teardownMinutes?: number;
  locationKind?: LocationKind | null;
  locationResourceId?: string | null;
  address?: string | null;
  mapUrl?: string | null;
  resourceIds: string[];
};

/**
 * Approves a request: fixes the window, assigns the resources, and moves the
 * shoot to `confirmed`.
 *
 * Order matters. The assignments are written first while the shoot is still
 * pending, so they do not block; the status change at the end is what flips
 * `blocking` to true through the trigger and fires the exclusion constraint.
 * If it fires, the whole transaction rolls back and nothing was half-booked.
 */
export async function confirmShoot(ctx: Ctx, id: string, plan: Schedule): Promise<void> {
  assertStaff(ctx);
  try {
    await tx(async (client) => {
      await client.query(
        `update shoots set
           starts_at = $2, ends_at = $3,
           setup_minutes = coalesce($4, setup_minutes),
           teardown_minutes = coalesce($5, teardown_minutes),
           location_kind = coalesce($6::location_kind, location_kind),
           location_resource_id = $7,
           address = coalesce($8, address),
           map_url = coalesce($9, map_url)
         where id = $1`,
        [
          id, plan.startsAt, plan.endsAt,
          plan.setupMinutes ?? null, plan.teardownMinutes ?? null,
          plan.locationKind ?? null, plan.locationResourceId ?? null,
          plan.address ?? null, plan.mapUrl ?? null,
        ],
      );

      await client.query("delete from shoot_resources where shoot_id = $1", [id]);
      for (const resourceId of plan.resourceIds) {
        await client.query(
          "insert into shoot_resources (shoot_id, resource_id) values ($1, $2)",
          [id, resourceId],
        );
      }

      await client.query(
        `update shoots set status = 'confirmed', confirmed_at = now(), confirmed_by = $2
          where id = $1`,
        [id, ctx.userId],
      );
      await client.query(
        `insert into shoot_events (shoot_id, actor_id, type, detail)
         values ($1, $2, 'confirmed', $3)`,
        [id, ctx.userId, JSON.stringify({ startsAt: plan.startsAt, endsAt: plan.endsAt })],
      );
    });
  } catch (err) {
    if (isExclusionViolation(err)) throw new ConflictError();
    throw err;
  }
}

/**
 * Moving a confirmed shoot. The status does not change - it is still
 * confirmed, just at a different time - and the move is recorded as an event,
 * which is what settles "you changed my date" later.
 */
export async function rescheduleShoot(
  ctx: Ctx,
  id: string,
  input: { startsAt: Date; endsAt: Date; note?: string | null },
): Promise<void> {
  assertStaff(ctx);
  const before = await one<{ starts_at: Date | null; ends_at: Date | null }>(
    "select starts_at, ends_at from shoots where id = $1",
    [id],
  );

  try {
    await tx(async (client) => {
      // The trigger in 0004 carries the assignments to the new window, so the
      // exclusion constraint is checked against it here.
      await client.query("update shoots set starts_at = $2, ends_at = $3 where id = $1", [
        id, input.startsAt, input.endsAt,
      ]);
      await client.query(
        `insert into shoot_events (shoot_id, actor_id, type, detail, note)
         values ($1, $2, 'rescheduled', $3, $4)`,
        [
          id, ctx.userId,
          JSON.stringify({
            from: before?.starts_at ?? null,
            to: input.startsAt,
          }),
          input.note ?? null,
        ],
      );
    });
  } catch (err) {
    if (isExclusionViolation(err)) throw new ConflictError();
    throw err;
  }
}

export async function setStatus(
  ctx: Ctx,
  id: string,
  status: ShootStatus,
  note?: string | null,
): Promise<void> {
  assertStaff(ctx);
  const type: ShootEventType =
    status === "cancelled" ? "cancelled"
    : status === "rejected" ? "rejected"
    : status === "delivered" ? "delivered"
    : "status_changed";

  try {
    await tx(async (client) => {
      await client.query(
        `update shoots set status = $2::shoot_status,
                cancelled_reason = case when $2 in ('cancelled','rejected')
                                        then $3 else cancelled_reason end
          where id = $1`,
        [id, status, note ?? null],
      );
      await client.query(
        `insert into shoot_events (shoot_id, actor_id, type, detail, note)
         values ($1, $2, $3::shoot_event_type, $4, $5)`,
        [id, ctx.userId, type, JSON.stringify({ status }), note ?? null],
      );
    });
  } catch (err) {
    if (isExclusionViolation(err)) throw new ConflictError();
    throw err;
  }
}

/** Editing the brief itself. Each changed field is recorded separately. */
export async function updateShootDetails(
  ctx: Ctx,
  id: string,
  patch: Partial<NewShoot>,
): Promise<void> {
  assertStaff(ctx);

  const fields: [keyof NewShoot, string, string][] = [
    ["title", "title", "text"],
    ["kind", "kind", "shoot_kind"],
    ["cameraCount", "camera_count", "int"],
    ["reelsRequired", "reels_required", "int"],
    ["photosRequired", "photos_required", "int"],
    ["products", "products", "text"],
    ["moodboardUrl", "moodboard_url", "text"],
    ["notes", "notes", "text"],
    ["address", "address", "text"],
  ];

  const sets: string[] = [];
  const params: unknown[] = [id];
  const changed: Record<string, unknown> = {};

  for (const [key, column, cast] of fields) {
    if (patch[key] === undefined) continue;
    params.push(patch[key]);
    sets.push(`${column} = $${params.length}::${cast}`);
    changed[column] = patch[key];
  }
  if (sets.length === 0) return;

  await tx(async (client) => {
    await client.query(`update shoots set ${sets.join(", ")} where id = $1`, params);
    await client.query(
      `insert into shoot_events (shoot_id, actor_id, type, detail)
       values ($1, $2, 'field_changed', $3)`,
      [id, ctx.userId, JSON.stringify(changed)],
    );
  });
}

// ---------------------------------------------------------------------------
// Assignments and the timeline
// ---------------------------------------------------------------------------

export type Assignment = {
  id: string;
  resourceId: string;
  name: string;
  kind: string;
  craft: string | null;
  role: string | null;
  startsAt: Date;
  endsAt: Date;
};

export async function shootResources(ctx: Ctx, shootId: string): Promise<Assignment[]> {
  // Visibility follows the shoot: if the caller can see it, they can see who
  // is on it.
  if (!(await getShoot(ctx, shootId))) throw new ForbiddenError();
  return query<Assignment>(
    `select sr.id, sr.resource_id as "resourceId", r.name, r.kind::text as kind,
            r.craft::text as craft, sr.role,
            sr.starts_at as "startsAt", sr.ends_at as "endsAt"
       from shoot_resources sr
       join resources r on r.id = sr.resource_id
      where sr.shoot_id = $1
      order by array_position(array['person','studio','equipment']::resource_kind[], r.kind),
               r.name`,
    [shootId],
  );
}

/**
 * Assignments for the public confirmation page, which has no session.
 *
 * It takes no Ctx on purpose, and is named so that is obvious: the caller has
 * already proved possession of the shoot's confirm token, which is the only
 * credential that page has. Faking an admin Ctx to reuse the scoped version
 * would put a hole in the model for every future reader to copy.
 */
export async function assignmentsByToken(token: string): Promise<Assignment[]> {
  return query<Assignment>(
    `select sr.id, sr.resource_id as "resourceId", r.name, r.kind::text as kind,
            r.craft::text as craft, sr.role,
            sr.starts_at as "startsAt", sr.ends_at as "endsAt"
       from shoot_resources sr
       join resources r on r.id = sr.resource_id
       join shoots    s on s.id = sr.shoot_id
      where s.confirm_token = $1
        and r.kind = 'person'
      order by r.name`,
    [token],
  );
}

export type ShootEvent = {
  id: string;
  type: ShootEventType;
  actorName: string | null;
  detail: Record<string, unknown>;
  note: string | null;
  createdAt: Date;
};

/**
 * The audit trail. Staff get everything; a client gets the subset that is
 * about their booking rather than about how the agency runs itself.
 */
export async function shootEvents(ctx: Ctx, shootId: string): Promise<ShootEvent[]> {
  if (!(await getShoot(ctx, shootId))) throw new ForbiddenError();

  const visibleOnly = ctx.role === "client" || ctx.role === "crew";
  return query<ShootEvent>(
    `select e.id, e.type, u.full_name as "actorName", e.detail, e.note,
            e.created_at as "createdAt"
       from shoot_events e
       left join users u on u.id = e.actor_id
      where e.shoot_id = $1
        and (not $2 or e.type = any(array[
              'created','confirmed','rescheduled','status_changed',
              'cancelled','rejected','delivered','approved']::shoot_event_type[]))
      order by e.created_at desc`,
    [shootId, visibleOnly],
  );
}

export async function addNote(ctx: Ctx, shootId: string, note: string): Promise<void> {
  assertStaff(ctx);
  await query(
    `insert into shoot_events (shoot_id, actor_id, type, note)
     values ($1, $2, 'note', $3)`,
    [shootId, ctx.userId, note],
  );
}

// ---------------------------------------------------------------------------
// Reminders (read by the worker, so no Ctx - there is no user behind a tick)
// ---------------------------------------------------------------------------

export type DueReminder = {
  shootId: string;
  ref: string;
  title: string;
  startsAt: Date;
  timezone: string;
  clientName: string;
};

/**
 * Confirmed shoots whose reminder moment has arrived and has not passed the
 * shoot itself.
 *
 * The `shoot_reminders` join is what makes this safe to run every minute: a
 * reminder already sent is excluded permanently. The job queue's dedupe key
 * cannot do that job, because it frees as soon as the job completes.
 */
export async function shootsDueForReminder(offsetHours: number): Promise<DueReminder[]> {
  return query<DueReminder>(
    `select s.id as "shootId", s.ref, s.title, s.starts_at as "startsAt",
            s.timezone, c.name as "clientName"
       from shoots s
       join clients c on c.id = s.client_id
      where s.status = 'confirmed'
        and s.starts_at is not null
        and s.starts_at > now()
        and s.starts_at <= now() + ($1 || ' hours')::interval
        and not exists (
          select 1 from shoot_reminders r
           where r.shoot_id = s.id and r.offset_hours = $2
        )`,
    [String(offsetHours), offsetHours],
  );
}

/**
 * Claims the right to send one reminder. Returns false when another worker -
 * or an earlier tick - already took it, so the caller simply does nothing.
 *
 * Claiming BEFORE sending means a crash mid-send loses a reminder rather than
 * sending it forever, which is the right way round for something a client
 * receives.
 */
export async function claimReminder(shootId: string, offsetHours: number): Promise<boolean> {
  const row = await one<{ shoot_id: string }>(
    `insert into shoot_reminders (shoot_id, offset_hours) values ($1, $2)
     on conflict do nothing returning shoot_id`,
    [shootId, offsetHours],
  );
  return row !== null;
}

/** Everyone who should hear about a shoot: the client contacts and the crew. */
export async function shootAudience(shootId: string): Promise<
  { userId: string; email: string; fullName: string; locale: "ar" | "en"; role: string }[]
> {
  return query(
    `select u.id as "userId", u.email, u.full_name as "fullName", u.locale, u.role::text as role
       from users u
       join client_members m on m.user_id = u.id
       join shoots s on s.client_id = m.client_id
      where s.id = $1 and u.active and u.password_hash is not null
      union
     select u.id, u.email, u.full_name, u.locale, u.role::text
       from users u
       join resources r on r.user_id = u.id
       join shoot_resources sr on sr.resource_id = r.id
      where sr.shoot_id = $1 and u.active and u.password_hash is not null`,
    [shootId],
  );
}
