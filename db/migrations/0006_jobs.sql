-- ============================================================
-- HUE Studio - 0006: the job queue
--
-- Postgres is the queue. Every outbound email and every reminder goes through
-- it rather than being sent inline, so a provider outage retries instead of
-- silently losing a client's confirmation.
--
-- Workers claim with FOR UPDATE SKIP LOCKED, so two of them never send the
-- same reminder twice, and a worker that dies mid-job loses its lease rather
-- than its job.
-- ============================================================

create type job_status as enum ('pending', 'running', 'done', 'failed', 'dead');

create table jobs (
  id             uuid primary key default gen_random_uuid(),
  type           text not null,
  payload        jsonb not null default '{}'::jsonb,

  run_at         timestamptz not null default now(),
  status         job_status not null default 'pending',

  attempts       integer not null default 0,
  max_attempts   integer not null default 5,

  -- The lease. locked_by names the worker; lease_expires_at is what lets a
  -- reaper reclaim work from a process that was killed mid-flight.
  locked_by         text,
  locked_at         timestamptz,
  lease_expires_at  timestamptz,

  last_error     text,
  finished_at    timestamptz,

  -- Optional: enqueueing the same logical work twice is a no-op.
  dedupe_key     text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- The claim query orders by run_at over pending rows only, so this index is
-- the whole hot path.
create index jobs_claimable_idx on jobs (run_at) where status = 'pending';
create index jobs_running_idx   on jobs (lease_expires_at) where status = 'running';
create index jobs_type_idx      on jobs (type, status);

-- Only one live job per dedupe key; finished ones do not block a re-enqueue.
create unique index jobs_dedupe_key
  on jobs (dedupe_key)
  where dedupe_key is not null and status in ('pending', 'running');

create trigger jobs_set_updated_at before update on jobs
  for each row execute function set_updated_at();

comment on table jobs is 'Durable work. Claimed with FOR UPDATE SKIP LOCKED under a lease.';
comment on column jobs.status is 'dead means the attempts ran out - it stays for a human to look at.';

