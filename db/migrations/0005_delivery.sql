-- ============================================================
-- HUE Studio - 0005: the record, the handover, the inbox
--
-- shoot_events does double duty: the full audit trail the agency needs when a
-- client says "you moved my date", and - filtered - the timeline the client
-- sees. One append-only table, two readers, no chance of the two versions of
-- history disagreeing.
-- ============================================================

create type shoot_event_type as enum (
  'created', 'confirmed', 'rescheduled', 'reassigned', 'field_changed',
  'status_changed', 'cancelled', 'rejected', 'delivered', 'approved', 'note'
);

create table shoot_events (
  id       uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references shoots(id) on delete cascade,
  -- Null for events raised by the worker rather than a person.
  actor_id uuid references users(id) on delete set null,
  type     shoot_event_type not null,
  -- For field_changed / rescheduled: {"field": "...", "from": ..., "to": ...}
  detail   jsonb not null default '{}'::jsonb,
  note     text,
  created_at timestamptz not null default now()
);

create index shoot_events_shoot_idx on shoot_events (shoot_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Deliverables. Drive links, not uploads: nobody wants 200GB of raw video on
-- an 8GB VPS, and the crew already works in Drive.
-- ---------------------------------------------------------------------------
create type deliverable_kind as enum ('raw', 'final');

create table deliverables (
  id       uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references shoots(id) on delete cascade,
  kind     deliverable_kind not null,
  url      text not null,
  label    text,
  added_by uuid references users(id) on delete set null,

  -- Raw footage is crew-only by default; the final cut is what the client
  -- opens. The producer can override either way.
  client_visible boolean not null default false,

  -- Closing the loop: the client explicitly accepts the final cut, which is
  -- what turns "I sent the link" into "they took delivery".
  approved_at timestamptz,
  approved_by uuid references users(id) on delete set null,
  rating      integer check (rating between 1 and 5),
  rating_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint only_final_is_approved check (approved_at is null or kind = 'final')
);

create index deliverables_shoot_idx on deliverables (shoot_id);

create trigger deliverables_set_updated_at before update on deliverables
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- In-app notifications.
-- ---------------------------------------------------------------------------
create table notifications (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references users(id) on delete cascade,
  type     text not null,
  title    text not null,
  body     text,
  link     text,
  shoot_id uuid references shoots(id) on delete cascade,
  read_at  timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_unread_idx
  on notifications (user_id, created_at desc) where read_at is null;

-- ---------------------------------------------------------------------------
-- Every send, attempted or skipped. Without this "we emailed you the
-- confirmation" is an assertion; with it, it is a record.
-- ---------------------------------------------------------------------------
create table email_log (
  id         uuid primary key default gen_random_uuid(),
  to_email   text not null,
  subject    text not null,
  template   text not null,
  shoot_id   uuid references shoots(id) on delete set null,
  -- 'sent' when the provider accepted it, 'skipped' when no API key is
  -- configured (local development), 'failed' with the reason in `error`.
  status     text not null,
  error      text,
  created_at timestamptz not null default now()
);

create index email_log_shoot_idx on email_log (shoot_id, created_at desc);
