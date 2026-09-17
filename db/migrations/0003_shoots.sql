-- ============================================================
-- HUE Studio - 0003: the shoot
--
-- Per the spec, `title` is the ONLY required field. Everything else is a
-- proposal the client may leave blank and the producer fills in at approval
-- time. That is deliberate: a half-filled request that arrives is worth more
-- than a complete one the client abandoned.
--
-- The request and the booking are kept apart. requested_date / requested_time
-- are what the client asked for and never change; starts_at / ends_at are what
-- was actually agreed, and they are the only thing the calendar and the
-- conflict constraint look at.
-- ============================================================

create type shoot_kind    as enum ('photo', 'video', 'both');
create type shoot_status  as enum (
  'pending', 'confirmed', 'in_progress', 'completed',
  'delivered', 'cancelled', 'rejected'
);
create type location_kind as enum ('studio', 'on_location');

-- Human-facing reference: SH-2026-0001, restarting each year.
create sequence shoot_ref_seq;

create table shoots (
  id         uuid primary key default gen_random_uuid(),
  ref        text not null unique,
  client_id  uuid not null references clients(id),
  created_by uuid not null references users(id),

  -- The one required field.
  title  text not null check (length(btrim(title)) > 0),
  kind   shoot_kind,
  status shoot_status not null default 'pending',

  -- A reshoot points at what it is redoing. This is what makes "reshoot rate
  -- per photographer" answerable, which is the real quality signal.
  parent_shoot_id uuid references shoots(id) on delete set null,
  reshoot_reason  text,

  -- What the client asked for. Preserved verbatim even after rescheduling, so
  -- there is always a record of the original ask.
  requested_date  date,
  requested_time  time,
  requested_notes text,

  -- What was agreed. Includes setup and teardown: the block the studio is
  -- actually occupied for, which is what must not overlap.
  starts_at timestamptz,
  ends_at   timestamptz,
  setup_minutes    integer not null default 0 check (setup_minutes >= 0),
  teardown_minutes integer not null default 0 check (teardown_minutes >= 0),

  -- Copied from the client at creation, not joined at read time: a confirmation
  -- already sent must keep meaning what it said even if the client later moves
  -- to another timezone.
  timezone text not null,

  location_kind        location_kind,
  location_resource_id uuid references resources(id),
  address              text,
  map_url              text,

  -- Logistics the crew needs before the day (spec section 2).
  camera_count    integer check (camera_count >= 0),
  reels_required  integer check (reels_required >= 0),
  photos_required integer check (photos_required >= 0),
  products        text,
  moodboard_url   text,
  notes           text,

  -- Lets the confirmation be opened from a WhatsApp forward without an account.
  confirm_token text not null unique default encode(gen_random_bytes(18), 'base64'),

  confirmed_at     timestamptz,
  confirmed_by     uuid references users(id),
  cancelled_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint shoot_window_ordered check (ends_at is null or starts_at < ends_at),
  -- A confirmed shoot without a time is a contradiction: the whole point of
  -- confirmation is that the moment is now fixed.
  constraint confirmed_shoot_is_scheduled check (
    status in ('pending', 'cancelled', 'rejected') or starts_at is not null
  ),
  constraint reshoot_is_not_its_own_parent check (parent_shoot_id is null or parent_shoot_id <> id)
);

create index shoots_client_idx  on shoots (client_id, created_at desc);
create index shoots_status_idx  on shoots (status);
create index shoots_window_idx  on shoots (starts_at) where starts_at is not null;
create index shoots_parent_idx  on shoots (parent_shoot_id) where parent_shoot_id is not null;
create index shoots_pending_idx on shoots (created_at desc) where status = 'pending';

create trigger shoots_set_updated_at before update on shoots
  for each row execute function set_updated_at();

-- Reference numbers are assigned in the database so two simultaneous requests
-- can never be handed the same one.
create or replace function assign_shoot_ref() returns trigger as $$
begin
  if new.ref is null or new.ref = '' then
    new.ref := 'SH-' || to_char(now(), 'YYYY') || '-'
               || lpad(nextval('shoot_ref_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger shoots_assign_ref before insert on shoots
  for each row execute function assign_shoot_ref();
