import { one, query } from "../index.ts";
import type { Ctx } from "../../types.ts";

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  shootId: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/**
 * In-app notifications. Written by whoever caused them, including the worker,
 * so there is no Ctx on the write path - the recipient list is worked out by
 * the caller from the shoot's audience.
 */
export async function notify(input: {
  userIds: string[];
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  shootId?: string | null;
}): Promise<void> {
  if (input.userIds.length === 0) return;
  await query(
    `insert into notifications (user_id, type, title, body, link, shoot_id)
     select unnest($1::uuid[]), $2, $3, $4, $5, $6`,
    [input.userIds, input.type, input.title, input.body ?? null, input.link ?? null,
     input.shootId ?? null],
  );
}

export async function listNotifications(ctx: Ctx, limit = 30): Promise<Notification[]> {
  return query<Notification>(
    `select id, type, title, body, link, shoot_id as "shootId",
            read_at as "readAt", created_at as "createdAt"
       from notifications where user_id = $1
      order by created_at desc limit $2`,
    [ctx.userId, limit],
  );
}

export async function unreadCount(ctx: Ctx): Promise<number> {
  const row = await one<{ count: string }>(
    "select count(*)::text as count from notifications where user_id = $1 and read_at is null",
    [ctx.userId],
  );
  return Number(row?.count ?? 0);
}

/** Scoped to the caller: nobody can mark someone else's notifications read. */
export async function markAllRead(ctx: Ctx): Promise<void> {
  await query(
    "update notifications set read_at = now() where user_id = $1 and read_at is null",
    [ctx.userId],
  );
}
