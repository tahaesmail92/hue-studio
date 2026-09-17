import { one, query } from "../index.ts";
import { nextRunAt, DEFAULT_MAX_ATTEMPTS, shouldRetry } from "../../queue/backoff.ts";

export type JobType =
  // Every outbound email goes through the queue rather than being sent inside
  // a request, so a provider outage retries instead of losing a confirmation.
  | "send_email"
  // Raised by the scheduler for each reminder offset before a confirmed shoot.
  | "shoot_reminder"
  | "housekeeping";

export type JobStatus = "pending" | "running" | "done" | "failed" | "dead";

export type Job = {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  status: JobStatus;
  lastError: string | null;
  createdAt: Date;
};

type JobRow = {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  run_at: Date;
  status: JobStatus;
  last_error: string | null;
  created_at: Date;
};

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAt: row.run_at,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

/**
 * Adds work. A dedupe key makes the call idempotent: enqueueing the same
 * logical job twice while the first is still live changes nothing, which is
 * what stops a scheduler tick from double-queuing every due post.
 */
export async function enqueue(input: {
  type: JobType;
  payload?: Record<string, unknown>;
  runAt?: Date;
  maxAttempts?: number;
  dedupeKey?: string;
}): Promise<string | null> {
  const row = await one<{ id: string }>(
    `insert into jobs (type, payload, run_at, max_attempts, dedupe_key)
     values ($1, $2, coalesce($3, now()), $4, $5)
     on conflict do nothing
     returning id`,
    [
      input.type,
      JSON.stringify(input.payload ?? {}),
      input.runAt ?? null,
      input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      input.dedupeKey ?? null,
    ],
  );
  return row?.id ?? null;
}

/**
 * Claims up to `limit` due jobs for this worker.
 *
 * SKIP LOCKED is what makes more than one worker safe: a row another worker
 * is already claiming is stepped over rather than waited on. The lease is
 * what makes a *dead* worker safe - see reclaimStaleJobs.
 */
export async function claimJobs(
  workerId: string,
  limit: number,
  leaseSeconds: number,
): Promise<Job[]> {
  const rows = await query<JobRow>(
    `with claimed as (
       select id from jobs
        where status = 'pending' and run_at <= now()
        order by run_at
        limit $2
        for update skip locked
     )
     update jobs j
        set status = 'running',
            attempts = j.attempts + 1,
            locked_by = $1,
            locked_at = now(),
            lease_expires_at = now() + ($3 || ' seconds')::interval
       from claimed
      where j.id = claimed.id
      returning j.id, j.type, j.payload, j.attempts, j.max_attempts, j.run_at,
                j.status, j.last_error, j.created_at`,
    [workerId, limit, String(leaseSeconds)],
  );
  return rows.map(toJob);
}

export async function completeJob(id: string): Promise<void> {
  await query(
    `update jobs
        set status = 'done', finished_at = now(), locked_by = null,
            lease_expires_at = null, last_error = null
      where id = $1`,
    [id],
  );
}

/**
 * Records a failure and decides what happens next: another attempt after a
 * backoff, or the dead letter.
 *
 * A dead job keeps its error text and stays visible. Silent infinite retries
 * are the failure mode this exists to prevent.
 */
export async function failJob(input: {
  id: string;
  attempts: number;
  maxAttempts: number;
  retryable: boolean;
  error: string;
  now?: Date;
}): Promise<"retrying" | "dead"> {
  const retry = shouldRetry(input);

  if (retry) {
    await query(
      `update jobs
          set status = 'pending', run_at = $2, locked_by = null,
              locked_at = null, lease_expires_at = null, last_error = $3
        where id = $1`,
      [input.id, nextRunAt(input.attempts, input.now), input.error.slice(0, 2000)],
    );
    return "retrying";
  }

  await query(
    `update jobs
        set status = 'dead', finished_at = now(), locked_by = null,
            locked_at = null, lease_expires_at = null, last_error = $2
      where id = $1`,
    [input.id, input.error.slice(0, 2000)],
  );
  return "dead";
}

/**
 * Puts a job back without spending an attempt.
 *
 * Used when we decline to run it for a reason that is not a failure - a
 * provider rate limit, say. Charging an attempt for that would exhaust the
 * retries on an email that was never actually attempted.
 */
export async function deferJob(id: string, runAt: Date, reason: string): Promise<void> {
  await query(
    `update jobs
        set status = 'pending', run_at = $2, attempts = greatest(0, attempts - 1),
            locked_by = null, locked_at = null, lease_expires_at = null, last_error = $3
      where id = $1`,
    [id, runAt, reason.slice(0, 2000)],
  );
}

/**
 * Returns jobs whose worker died to the pending pool.
 *
 * Without this, a container restart mid-send would strand the job as
 * "running" forever and the email would silently never go out.
 */
export async function reclaimStaleJobs(): Promise<number> {
  const rows = await query<{ id: string }>(
    `update jobs
        set status = 'pending', locked_by = null, locked_at = null,
            lease_expires_at = null,
            last_error = coalesce(last_error, 'The worker holding this job stopped responding.')
      where status = 'running' and lease_expires_at < now()
      returning id`,
  );
  return rows.length;
}

export async function queueDepth(): Promise<{
  pending: number;
  running: number;
  dead: number;
  overdueSeconds: number;
}> {
  const row = await one<{
    pending: string;
    running: string;
    dead: string;
    overdue: string | null;
  }>(
    `select count(*) filter (where status = 'pending')::text as pending,
            count(*) filter (where status = 'running')::text as running,
            count(*) filter (where status = 'dead')::text as dead,
            -- FILTER attaches to the aggregate, not to the expression around
            -- it: min(...) filter (...), never extract(...) filter (...).
            coalesce(
              extract(epoch from now() -
                min(run_at) filter (where status = 'pending' and run_at <= now())),
              0)::text as overdue
       from jobs`,
  );
  return {
    pending: Number(row?.pending ?? 0),
    running: Number(row?.running ?? 0),
    dead: Number(row?.dead ?? 0),
    overdueSeconds: Math.round(Number(row?.overdue ?? 0)),
  };
}

export async function listDeadJobs(limit = 50): Promise<Job[]> {
  const rows = await query<JobRow>(
    `select id, type, payload, attempts, max_attempts, run_at, status, last_error, created_at
       from jobs where status = 'dead' order by updated_at desc limit $1`,
    [limit],
  );
  return rows.map(toJob);
}

/** Puts a dead job back at the front of the queue, attempts reset. */
export async function retryDeadJob(id: string): Promise<void> {
  await query(
    `update jobs
        set status = 'pending', attempts = 0, run_at = now(), finished_at = null
      where id = $1 and status = 'dead'`,
    [id],
  );
}

export async function pruneFinishedJobs(days = 14): Promise<number> {
  const rows = await query<{ id: string }>(
    `delete from jobs
      where status = 'done' and finished_at < now() - ($1 || ' days')::interval
      returning id`,
    [String(days)],
  );
  return rows.length;
}
