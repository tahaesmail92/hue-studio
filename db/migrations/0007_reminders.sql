-- ============================================================
-- HUE Studio - 0007: remembering that a reminder was sent
--
-- The job queue's dedupe key cannot answer this. That index only covers
-- pending and running rows, so the key frees the instant the job finishes -
-- and the next scheduler tick queues the very same reminder again. With a
-- 60-second tick that is a reminder a minute, all day, to a client.
--
-- This table is the durable record instead: the insert is the claim, and a
-- conflict means it has already gone out. It outlives job pruning, which is
-- the whole point.
-- ============================================================

create table shoot_reminders (
  shoot_id     uuid not null references shoots(id) on delete cascade,
  offset_hours integer not null,
  sent_at      timestamptz not null default now(),
  primary key (shoot_id, offset_hours)
);
