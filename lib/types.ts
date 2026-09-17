// ---------------------------------------------------------------------------
// Domain vocabulary.
//
// NAMING: the thing a client books is a SHOOT, never a "session" - `sessions`
// is the auth table. In Arabic the UI calls it "جلسة"; in code it is a shoot,
// everywhere, without exception.
// ---------------------------------------------------------------------------

export type Locale = "ar" | "en";
export const LOCALES: Locale[] = ["ar", "en"];

export type Role = "admin" | "producer" | "crew" | "client";
export const ROLES: Role[] = ["admin", "producer", "crew", "client"];

/** Runs the department: sees and edits everything. */
export function isStaff(role: Role): boolean {
  return role === "admin" || role === "producer";
}

export type ClientStatus = "active" | "paused" | "archived";
export const CLIENT_STATUSES: ClientStatus[] = ["active", "paused", "archived"];

export type ResourceKind = "person" | "studio" | "equipment";
export const RESOURCE_KINDS: ResourceKind[] = ["person", "studio", "equipment"];

export type Craft = "photographer" | "videographer" | "editor";
export const CRAFTS: Craft[] = ["photographer", "videographer", "editor"];

export type ShootKind = "photo" | "video" | "both";
export const SHOOT_KINDS: ShootKind[] = ["photo", "video", "both"];

export type ShootStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "delivered"
  | "cancelled"
  | "rejected";

export const SHOOT_STATUSES: ShootStatus[] = [
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "delivered",
  "cancelled",
  "rejected",
];

/**
 * The statuses that actually hold a resource. A pending request is a proposal,
 * not a booking, so it never blocks anyone's calendar - this list is mirrored
 * by the `shoot_blocks` SQL function that drives shoot_resources.blocking.
 */
export const BLOCKING_STATUSES: ShootStatus[] = [
  "confirmed",
  "in_progress",
  "completed",
  "delivered",
];

export function isBlocking(status: ShootStatus): boolean {
  return BLOCKING_STATUSES.includes(status);
}

/** Terminal states: nothing moves out of these except by reopening. */
export function isClosed(status: ShootStatus): boolean {
  return status === "cancelled" || status === "rejected";
}

export type LocationKind = "studio" | "on_location";

export type DeliverableKind = "raw" | "final";

export type ShootEventType =
  | "created"
  | "confirmed"
  | "rescheduled"
  | "reassigned"
  | "field_changed"
  | "status_changed"
  | "cancelled"
  | "rejected"
  | "delivered"
  | "approved"
  | "note";

/**
 * The event types a client is allowed to see on their own timeline. Everything
 * else (internal reassignment, field edits, notes) stays inside the agency.
 */
export const CLIENT_VISIBLE_EVENTS: ShootEventType[] = [
  "created",
  "confirmed",
  "rescheduled",
  "status_changed",
  "cancelled",
  "rejected",
  "delivered",
  "approved",
];

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/**
 * The context every repository function takes as its first argument. There is
 * no row-level security in the database - only our server talks to Postgres -
 * so this is where scoping is enforced. Enforcing it in the data layer rather
 * than the UI is what guarantees a client cannot see another client even if a
 * page forgets to filter.
 */
export type Ctx = {
  userId: string;
  role: Role;
  /** True for admin and producer. */
  allClients: boolean;
  /** For a client user: the companies they belong to. Empty for staff. */
  clientIds: string[];
  /** For a crew user: the `resources` row that represents them. */
  resourceId: string | null;
};

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Throws unless the context may touch this client. */
export function assertClientAccess(ctx: Ctx, clientId: string): void {
  if (ctx.allClients) return;
  if (!ctx.clientIds.includes(clientId)) {
    throw new ForbiddenError("You are not assigned to this client.");
  }
}

export function assertStaff(ctx: Ctx): void {
  if (!isStaff(ctx.role)) throw new ForbiddenError("Staff only.");
}
