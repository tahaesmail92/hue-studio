import { one, tx } from "../index.ts";
import type { Ctx } from "../../types.ts";

/**
 * Permanent deletion.
 *
 * Kept in its own module, away from the everyday repositories, because this is
 * the one place in the system that destroys rather than records. Everything
 * else suspends, archives or retires.
 *
 * Two rules shape all of it:
 *
 *  - **Admin only.** A producer can run the department; unmaking records is a
 *    different kind of authority.
 *  - **Count first, then delete.** Every function here has a matching
 *    `impactOf...` that reports exactly what would go, so the confirmation a
 *    person sees is the truth rather than a generic warning.
 */

export class NotAllowed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotAllowed";
  }
}

function assertAdmin(ctx: Ctx): void {
  if (ctx.role !== "admin") {
    throw new NotAllowed("Only an administrator can permanently delete records.");
  }
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export type ClientImpact = {
  clientName: string;
  shoots: number;
  deliverables: number;
  events: number;
  /** Contacts who belong to this client and to no other. */
  contactsRemoved: number;
  /** Contacts who also belong to another client; they keep their account. */
  contactsKept: number;
};

export async function impactOfDeletingClient(
  ctx: Ctx,
  clientId: string,
): Promise<ClientImpact | null> {
  assertAdmin(ctx);

  const row = await one<{
    clientName: string; shoots: string; deliverables: string;
    events: string; contactsRemoved: string; contactsKept: string;
  }>(
    `select c.name as "clientName",
            (select count(*) from shoots s where s.client_id = c.id)::text as shoots,
            (select count(*) from deliverables d
               join shoots s on s.id = d.shoot_id where s.client_id = c.id)::text as deliverables,
            (select count(*) from shoot_events e
               join shoots s on s.id = e.shoot_id where s.client_id = c.id)::text as events,
            -- A contact attached only here loses their account with the client;
            -- one who also works with another client keeps it.
            (select count(*) from client_members m
              where m.client_id = c.id
                and not exists (select 1 from client_members o
                                 where o.user_id = m.user_id and o.client_id <> c.id))::text
              as "contactsRemoved",
            (select count(*) from client_members m
              where m.client_id = c.id
                and exists (select 1 from client_members o
                             where o.user_id = m.user_id and o.client_id <> c.id))::text
              as "contactsKept"
       from clients c where c.id = $1`,
    [clientId],
  );
  if (!row) return null;

  return {
    clientName: row.clientName,
    shoots: Number(row.shoots),
    deliverables: Number(row.deliverables),
    events: Number(row.events),
    contactsRemoved: Number(row.contactsRemoved),
    contactsKept: Number(row.contactsKept),
  };
}

/**
 * Removes a client and everything that was theirs.
 *
 * Order matters and is explicit rather than left to cascades: assignments are
 * released before the shoots that hold them, because shoot_resources is
 * ON DELETE RESTRICT on the resource side and a half-applied delete would be
 * worse than none. The whole thing is one transaction.
 */
export async function deleteClientForever(ctx: Ctx, clientId: string): Promise<void> {
  assertAdmin(ctx);

  await tx(async (db) => {
    // Free the resources first: nothing may still be holding a booking.
    await db.query(
      `delete from shoot_resources sr
        using shoots s where s.id = sr.shoot_id and s.client_id = $1`,
      [clientId],
    );

    // A reshoot of one of these shoots that belongs to someone else would be
    // orphaned; parent_shoot_id is ON DELETE SET NULL, so it survives unlinked.
    await db.query("delete from shoots where client_id = $1", [clientId]);

    // Contacts who exist only for this client. Doing this before the client row
    // means client_members is still there to identify them.
    await db.query(
      `delete from users u
        where u.role = 'client'
          and exists (select 1 from client_members m
                       where m.user_id = u.id and m.client_id = $1)
          and not exists (select 1 from client_members o
                           where o.user_id = u.id and o.client_id <> $1)`,
      [clientId],
    );

    await db.query("delete from clients where id = $1", [clientId]);
  });
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export type PersonImpact = {
  fullName: string;
  role: string;
  /** Bookings this person is on. The shoots themselves are not touched. */
  assignments: number;
  /** Shoots they filed or confirmed - these survive, without their name. */
  shootsAttributed: number;
  /** True when they are the last administrator. */
  lastAdmin: boolean;
};

export async function impactOfDeletingPerson(
  ctx: Ctx,
  userId: string,
): Promise<PersonImpact | null> {
  assertAdmin(ctx);

  const row = await one<{
    fullName: string; role: string;
    assignments: string; shootsAttributed: string; lastAdmin: boolean;
  }>(
    `select u.full_name as "fullName", u.role::text as role,
            (select count(*) from shoot_resources sr
               join resources r on r.id = sr.resource_id
              where r.user_id = u.id)::text as assignments,
            (select count(*) from shoots s
              where s.created_by = u.id or s.confirmed_by = u.id)::text as "shootsAttributed",
            (u.role = 'admin' and (select count(*) from users a
                                    where a.role = 'admin' and a.active) <= 1) as "lastAdmin"
       from users u where u.id = $1`,
    [userId],
  );
  if (!row) return null;

  return {
    fullName: row.fullName,
    role: row.role,
    assignments: Number(row.assignments),
    shootsAttributed: Number(row.shootsAttributed),
    lastAdmin: row.lastAdmin,
  };
}

/**
 * Removes a person: their login, and the resource they were booked as.
 *
 * Their work is not removed. Shoots they filed or confirmed keep existing with
 * the name dropped - 0008 made those columns ON DELETE SET NULL precisely so
 * that deleting a freelancer cannot take a year of bookings with them.
 */
export async function deletePersonForever(ctx: Ctx, userId: string): Promise<void> {
  assertAdmin(ctx);

  if (userId === ctx.userId) {
    throw new NotAllowed("You cannot delete your own account.");
  }
  const impact = await impactOfDeletingPerson(ctx, userId);
  if (!impact) throw new NotAllowed("No such person.");
  // Locking everyone out of the system is not a thing to do by accident.
  if (impact.lastAdmin) {
    throw new NotAllowed("This is the last administrator.");
  }

  await tx(async (db) => {
    // Release bookings before the resource that RESTRICTs on them. This does
    // lose the record of who was on those shoots - which is the point of a
    // permanent delete, and is why the confirmation says so.
    await db.query(
      `delete from shoot_resources sr
        using resources r where r.id = sr.resource_id and r.user_id = $1`,
      [userId],
    );
    await db.query("delete from resources where user_id = $1", [userId]);
    // sessions, invites, client_members and notifications all cascade.
    await db.query("delete from users where id = $1", [userId]);
  });
}
