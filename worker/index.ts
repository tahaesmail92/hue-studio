// The background process.
//
// Two things cannot happen inside a web request: sending an email that must
// survive a provider outage, and noticing that a shoot is 24 hours away. Both
// live here.
//
//   npm run worker          (local)
//   docker compose up -d    (production - the `worker` service)
//
// Safe to run alongside another copy of itself: jobs are claimed with
// FOR UPDATE SKIP LOCKED under a lease, so two workers never take the same one.
import { randomUUID } from "node:crypto";
import {
  claimJobs,
  completeJob,
  enqueue,
  failJob,
  reclaimStaleJobs,
  type Job,
} from "../lib/db/repo/jobs.ts";
import { runJob } from "../lib/queue/handlers.ts";
import { scheduleReminders } from "../lib/queue/reminders.ts";

const WORKER_ID = `${process.env.HOSTNAME ?? "worker"}-${randomUUID().slice(0, 8)}`;
const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 60_000);
const BATCH = Number(process.env.WORKER_BATCH ?? 5);
const LEASE_SECONDS = Number(process.env.WORKER_LEASE_SECONDS ?? 300);

let stopping = false;

async function handle(job: Job): Promise<void> {
  try {
    await runJob(job);
    await completeJob(job.id);
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    // Anything a handler did not explicitly mark permanent is treated as
    // transient: the cost of one extra retry is far lower than the cost of
    // silently dropping a client's booking confirmation.
    const retryable = !(cause instanceof PermanentFailure);
    const outcome = await failJob({
      id: job.id,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      retryable,
      error,
    });
    console.error(`[worker] ${job.type} ${job.id} failed (${outcome}): ${error}`);
  }
}

/** Thrown by a handler when retrying could not possibly help. */
export class PermanentFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentFailure";
  }
}

async function tick(): Promise<void> {
  const reclaimed = await reclaimStaleJobs();
  if (reclaimed > 0) console.warn(`[worker] reclaimed ${reclaimed} stranded job(s)`);

  const jobs = await claimJobs(WORKER_ID, BATCH, LEASE_SECONDS);
  for (const job of jobs) {
    if (stopping) break;
    await handle(job);
  }

  // Noticing that a shoot is tomorrow is the other thing a web request cannot
  // do. Safe every tick: the dedupe key makes a second pass a no-op.
  const reminders = await scheduleReminders();
  if (reminders > 0) console.info(`[worker] queued ${reminders} reminder(s)`);

  await scheduleHousekeeping();
}

/**
 * Housekeeping is a queued job rather than an inline call, so when it starts
 * failing it shows up in the same place as everything else.
 *
 * It is queued for the NEXT hour, not this one. The dedupe index only covers
 * pending and running rows, so a job queued for now completes immediately and
 * frees its key - and the following tick would queue it again, every minute.
 * A job sitting pending until the hour turns holds its key for the whole hour,
 * which is what actually makes this hourly.
 */
async function scheduleHousekeeping(): Promise<void> {
  const nextHour = new Date();
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);

  await enqueue({
    type: "housekeeping",
    runAt: nextHour,
    dedupeKey: `housekeeping:${nextHour.toISOString().slice(0, 13)}`,
  });
}

async function main(): Promise<void> {
  console.info(`[worker] ${WORKER_ID} started, ticking every ${TICK_MS}ms`);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      console.info(`[worker] ${signal} - finishing the current job, then stopping`);
      stopping = true;
    });
  }

  while (!stopping) {
    try {
      await tick();
    } catch (cause) {
      // A tick that throws is usually the database being briefly unreachable.
      // Crashing the container would only restart this same loop.
      console.error("[worker] tick failed", cause);
    }
    if (stopping) break;
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }

  console.info("[worker] stopped");
  process.exit(0);
}

await main();
