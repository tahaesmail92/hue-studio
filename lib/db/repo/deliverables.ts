import { one, query, tx } from "../index.ts";
import type { Ctx, DeliverableKind } from "../../types.ts";
import { assertStaff, ForbiddenError } from "../../types.ts";
import { getShoot } from "./shoots.ts";

export type Deliverable = {
  id: string;
  shootId: string;
  kind: DeliverableKind;
  url: string;
  label: string | null;
  addedByName: string | null;
  clientVisible: boolean;
  approvedAt: Date | null;
  approvedByName: string | null;
  rating: number | null;
  ratingNote: string | null;
  createdAt: Date;
};

const SELECT = `
  select d.id, d.shoot_id as "shootId", d.kind, d.url, d.label,
         a.full_name as "addedByName",
         d.client_visible as "clientVisible",
         d.approved_at as "approvedAt", ap.full_name as "approvedByName",
         d.rating, d.rating_note as "ratingNote", d.created_at as "createdAt"
    from deliverables d
    left join users a  on a.id  = d.added_by
    left join users ap on ap.id = d.approved_by`;

/**
 * What each role may see.
 *
 * Raw footage is the crew's working material; the client sees the final cut.
 * The producer can override per link with `clientVisible`, which is how "here,
 * pick your favourites from the raws" happens without changing the default.
 */
export async function listDeliverables(ctx: Ctx, shootId: string): Promise<Deliverable[]> {
  if (!(await getShoot(ctx, shootId))) throw new ForbiddenError();

  if (ctx.role === "client") {
    return query<Deliverable>(
      `${SELECT} where d.shoot_id = $1 and d.client_visible order by d.kind, d.created_at`,
      [shootId],
    );
  }
  return query<Deliverable>(
    `${SELECT} where d.shoot_id = $1 order by d.kind, d.created_at`,
    [shootId],
  );
}

/**
 * Crew add raw footage from the shoot; only staff add a final cut, because a
 * final cut appearing is what tells the client the work is done.
 */
export async function addDeliverable(
  ctx: Ctx,
  input: {
    shootId: string;
    kind: DeliverableKind;
    url: string;
    label?: string | null;
    clientVisible?: boolean;
  },
): Promise<void> {
  const shoot = await getShoot(ctx, input.shootId);
  if (!shoot) throw new ForbiddenError();
  if (ctx.role === "client") throw new ForbiddenError("Clients do not upload deliverables.");
  if (ctx.role === "crew" && input.kind !== "raw") {
    throw new ForbiddenError("Only production can publish the final cut.");
  }

  await tx(async (client) => {
    await client.query(
      `insert into deliverables (shoot_id, kind, url, label, added_by, client_visible)
       values ($1, $2::deliverable_kind, $3, $4, $5, coalesce($6, $2 = 'final'))`,
      [
        input.shootId, input.kind, input.url.trim(), input.label ?? null, ctx.userId,
        input.clientVisible ?? null,
      ],
    );
    await client.query(
      `insert into shoot_events (shoot_id, actor_id, type, detail)
       values ($1, $2, 'delivered', $3)`,
      [input.shootId, ctx.userId, JSON.stringify({ kind: input.kind })],
    );

    // Sharing the final cut is what "delivered" means, so the status follows
    // the act rather than waiting for someone to remember to set it.
    if (input.kind === "final") {
      await client.query(
        `update shoots set status = 'delivered'
          where id = $1 and status in ('completed', 'in_progress', 'confirmed')`,
        [input.shootId],
      );
    }
  });
}

export async function setDeliverableVisibility(
  ctx: Ctx,
  id: string,
  visible: boolean,
): Promise<void> {
  assertStaff(ctx);
  await query("update deliverables set client_visible = $2 where id = $1", [id, visible]);
}

export async function removeDeliverable(ctx: Ctx, id: string): Promise<void> {
  assertStaff(ctx);
  await query("delete from deliverables where id = $1", [id]);
}

/**
 * The client accepting the final cut. This is what turns "I sent the link"
 * into "they took delivery", and it is the only write a client makes to a
 * shoot after submitting the request.
 */
export async function approveFinal(
  ctx: Ctx,
  deliverableId: string,
  input: { rating?: number | null; note?: string | null },
): Promise<void> {
  if (ctx.role !== "client") throw new ForbiddenError("Only the client approves the final cut.");

  const row = await one<{ shoot_id: string; client_id: string; kind: string }>(
    `select d.shoot_id, s.client_id, d.kind::text as kind
       from deliverables d join shoots s on s.id = d.shoot_id
      where d.id = $1`,
    [deliverableId],
  );
  if (!row) throw new ForbiddenError();
  if (!ctx.clientIds.includes(row.client_id)) throw new ForbiddenError();
  if (row.kind !== "final") throw new ForbiddenError("Only the final cut can be approved.");

  await tx(async (client) => {
    await client.query(
      `update deliverables
          set approved_at = now(), approved_by = $2, rating = $3, rating_note = $4
        where id = $1 and approved_at is null`,
      [deliverableId, ctx.userId, input.rating ?? null, input.note ?? null],
    );
    await client.query(
      `insert into shoot_events (shoot_id, actor_id, type, detail, note)
       values ($1, $2, 'approved', $3, $4)`,
      [row.shoot_id, ctx.userId, JSON.stringify({ rating: input.rating ?? null }),
       input.note ?? null],
    );
  });
}
