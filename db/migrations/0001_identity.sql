-- ============================================================
-- HUE Studio - 0001: who exists and how they get in
--
-- One `users` table for every role. A client user is linked to one or more
-- `clients` (the company) through client_members; a crew user is linked to the
-- `resources` row that represents them (0002), so "who is booked" and "who can
-- log in" stay separate concerns.
--
-- No password is ever emailed. An account is created dormant and activated
-- through an invite link whose raw token exists only in that email.
-- ============================================================

create extension if not exists citext;
create extension if not exists pgcrypto;

-- Shared updated_at trigger, used by most tables below.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create type user_role     as enum ('admin', 'producer', 'crew', 'client');
create type user_locale   as enum ('ar', 'en');
create type client_status as enum ('active', 'paused', 'archived');
create type invite_kind   as enum ('invite', 'reset');

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  full_name     text not null,
  role          user_role not null,
  -- Null until the invite is accepted: a dormant account cannot be logged into.
  password_hash text,
  active        boolean not null default true,
  locale        user_locale not null default 'ar',
  -- Display timezone. For a client user this normally mirrors their company.
  timezone      text not null default 'Africa/Cairo',
  phone         text,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index users_role_idx on users (role) where active;

create trigger users_set_updated_at before update on users
  for each row execute function set_updated_at();

-- The company, not the person. Session history, preferences and the visit
-- counter all hang off this.
create table clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  logo_url   text,
  sector     text,
  -- Scheduling happens here, not in the browser's zone: a Riyadh client's 9am
  -- is 9am in Riyadh even when the producer is in Cairo.
  timezone   text not null default 'Africa/Cairo',
  -- Standing preferences: "always two cameras", "prefers natural light".
  notes      text,
  status     client_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_status_idx on clients (status);

create trigger clients_set_updated_at before update on clients
  for each row execute function set_updated_at();

-- A client company may eventually have more than one contact who can log in.
create table client_members (
  user_id   uuid not null references users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  primary key (user_id, client_id)
);

create index client_members_client_idx on client_members (client_id);

-- Login sessions. The cookie holds the raw token; only its hash is stored, so
-- a database dump cannot be replayed as a login.
create table sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip         text,
  user_agent text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index sessions_user_idx    on sessions (user_id);
create index sessions_expiry_idx  on sessions (expires_at) where revoked_at is null;

-- Invites and password resets are the same mechanism with a different label:
-- a one-time link that lets someone set a password they choose themselves.
create table invites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       invite_kind not null default 'invite',
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index invites_user_idx on invites (user_id);

-- At most one live invite per user per kind; a consumed or expired one does
-- not block issuing a fresh link.
create unique index invites_one_live
  on invites (user_id, kind)
  where accepted_at is null;

-- Login throttling. Recording successes too makes the table readable as a
-- short access history when someone asks "who logged in from where".
create table login_attempts (
  id      bigserial primary key,
  -- Lowercased email, or "ip:<addr>" when the address is what is being limited.
  key     text not null,
  success boolean not null,
  ip      text,
  at      timestamptz not null default now()
);

create index login_attempts_key_idx on login_attempts (key, at desc);
