-- ============================================================
-- HUE Studio - 0002: the things that can be double-booked
--
-- A photographer, a studio and a camera body are the same kind of problem:
-- one of them, in one place, at one time. Modelling them as one `resources`
-- table is what lets a single exclusion constraint (0004) protect all three.
-- The spec's free-text "photographer name" field cannot do that.
-- ============================================================

create type resource_kind as enum ('person', 'studio', 'equipment');
create type craft         as enum ('photographer', 'videographer', 'editor');

create table resources (
  id       uuid primary key default gen_random_uuid(),
  kind     resource_kind not null,
  name     text not null,
  -- A person resource is linked to the account that person logs in with, so a
  -- crew member sees exactly the shoots they are booked on. Studios and
  -- equipment have no account.
  user_id  uuid unique references users(id) on delete set null,
  craft    craft,
  -- Free text: "Sony A7IV, body only", "Studio B - cyclorama".
  notes    text,
  active   boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Only a person has a craft, and only a person has a login.
  constraint resource_craft_only_for_person
    check (kind = 'person' or (craft is null and user_id is null))
);

create index resources_kind_idx on resources (kind) where active;

create trigger resources_set_updated_at before update on resources
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Settings: one row, enforced.
-- ---------------------------------------------------------------------------
create table settings (
  id  boolean primary key default true check (id),

  company_name    text not null default 'HUE Creative Group',
  company_email   text,
  company_phone   text,
  company_address text,
  logo_url        text,

  -- Working hours per weekday, keyed 0=Sunday .. 6=Saturday. A missing key or
  -- an empty array means closed. Drives which dates the request form offers.
  --   {"0": [["09:00","18:00"]], "5": []}
  working_hours jsonb not null default
    '{"0":[["09:00","18:00"]],"1":[["09:00","18:00"]],"2":[["09:00","18:00"]],
      "3":[["09:00","18:00"]],"4":[["09:00","18:00"]],"5":[],"6":[["09:00","18:00"]]}'::jsonb,

  -- Defaults applied when a producer confirms a shoot without saying otherwise.
  default_setup_minutes    integer not null default 60,
  default_teardown_minutes integer not null default 30,
  default_duration_minutes integer not null default 180,

  -- How long before a shoot the client and crew are reminded, in hours.
  -- One job is queued per offset.
  reminder_offsets_hours integer[] not null default '{24,2}',

  -- Turn the self-serve "forgot password" link off if the agency would rather
  -- issue every reset by hand. The invite mechanism is unaffected.
  allow_self_reset boolean not null default true,

  updated_at timestamptz not null default now()
);

create trigger settings_set_updated_at before update on settings
  for each row execute function set_updated_at();

insert into settings (id) values (true);

-- Days the studio is shut: public holidays, Eid, a team offsite.
create table blackout_dates (
  day        date primary key,
  reason     text,
  created_at timestamptz not null default now()
);
