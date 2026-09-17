-- ============================================================
-- HUE Studio - 0004: no double booking, guaranteed by Postgres
--
-- The spec asks for a warning when two shoots collide. A warning is not
-- enough: two producers confirming at the same moment both pass an
-- application-level check and both write. So the rule lives in the database,
-- as an exclusion constraint, where concurrency cannot get around it.
--
-- `blocking` is what makes a pending request cost nothing. A request is a
-- proposal - three clients may ask for Thursday 9am and all three requests sit
-- there happily. The moment one is confirmed it claims the slot and the other
-- two can no longer be confirmed into it.
-- ============================================================

create extension if not exists btree_gist;

create table shoot_resources (
  id          uuid primary key default gen_random_uuid(),
  shoot_id    uuid not null references shoots(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete restrict,
  -- "Lead photographer", "second camera", "gimbal op".
  role        text,

  -- Usually the whole shoot window, but a resource can be booked for part of
  -- it: a second camera that only comes for the last two hours.
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  during    tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,

  -- Mirrors the parent shoot's status. Maintained by trigger only - never set
  -- this from the application.
  blocking boolean not null default false,

  created_at timestamptz not null default now(),

  constraint assignment_window_ordered check (ends_at > starts_at),
  unique (shoot_id, resource_id)
);

create index shoot_resources_shoot_idx    on shoot_resources (shoot_id);
create index shoot_resources_resource_idx on shoot_resources (resource_id);

-- The guarantee. Half-open ranges '[)' mean 12:00-14:00 and 14:00-16:00 are
-- back to back rather than a conflict, which is how a studio day actually runs.
alter table shoot_resources
  add constraint no_double_booking
  exclude using gist (resource_id with =, during with &&)
  where (blocking);

-- ---------------------------------------------------------------------------
-- Keeping `blocking` honest.
-- ---------------------------------------------------------------------------

-- Single source of truth for "does this status hold the slot", mirrored by
-- BLOCKING_STATUSES in lib/types.ts.
create or replace function shoot_status_blocks(s shoot_status) returns boolean as $$
  select s in ('confirmed', 'in_progress', 'completed', 'delivered');
$$ language sql immutable;

-- On insert, an assignment inherits its parent shoot's status, and defaults to
-- the shoot's own window when no narrower one is given.
create or replace function shoot_resource_defaults() returns trigger as $$
declare
  parent shoots%rowtype;
begin
  select * into parent from shoots where id = new.shoot_id;

  if new.starts_at is null then new.starts_at := parent.starts_at; end if;
  if new.ends_at   is null then new.ends_at   := parent.ends_at;   end if;

  if new.starts_at is null or new.ends_at is null then
    raise exception 'Cannot assign a resource to a shoot that has no scheduled window yet.'
      using errcode = 'check_violation';
  end if;

  new.blocking := shoot_status_blocks(parent.status);
  return new;
end;
$$ language plpgsql;

create trigger shoot_resources_defaults before insert on shoot_resources
  for each row execute function shoot_resource_defaults();

-- When a shoot is confirmed, cancelled or moved, its assignments follow.
--
-- The window shift deliberately only touches assignments that spanned the whole
-- old shoot - the common case. A resource booked for a narrower slice was set
-- that way on purpose, so a reschedule surfaces it for the producer to redo
-- rather than silently guessing a new offset.
create or replace function sync_shoot_resources() returns trigger as $$
begin
  if old.status is distinct from new.status then
    update shoot_resources
       set blocking = shoot_status_blocks(new.status)
     where shoot_id = new.id;
  end if;

  if (old.starts_at is distinct from new.starts_at
      or old.ends_at is distinct from new.ends_at)
     and new.starts_at is not null and new.ends_at is not null then
    update shoot_resources
       set starts_at = new.starts_at,
           ends_at   = new.ends_at
     where shoot_id = new.id
       and starts_at = old.starts_at
       and ends_at   = old.ends_at;
  end if;

  return null;
end;
$$ language plpgsql;

create trigger shoots_sync_resources after update on shoots
  for each row execute function sync_shoot_resources();
