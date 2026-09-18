import { timingSafeEqual } from "node:crypto";
import {
  claimJobs,
  completeJob,
  failJob,
  reclaimStaleJobs,
} from "@/lib/db/repo/jobs";
import { runJob } from "@/lib/queue/handlers";
import { scheduleReminders } from "@/lib/queue/reminders";

export const dynamic = "force-dynamic";
// The queue is worked in-request here, so give it room. Still well under the
// platform's ceiling, and a job that cannot finish in this window belongs in
// the worker process, not in a cron hit.
export const maxDuration = 60;

/**
 * One turn of the worker loop, over HTTP.
 *
 * On the VPS the worker is a long-lived process that ticks every minute. A
 * serverless platform has no such thing, so the same work is driven by a
 * scheduled request instead. The logic is identical - this route is a
 * different *trigger*, not a second implementation.
 *
 * Deliberately capped at a handful of jobs per call: a cron hit that tries to
 * drain a large backlog will hit the duration limit and lose its lease on
 * everything it was holding. A backlog drains over consecutive ticks instead.
 */
const BATCH = 10;
const LEASE_SECONDS = 120;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Refuse rather than run wide open: this endpoint sends real email.
  if (!secret) return false;

  // Vercel Cron signs its own requests with this header; anything else has to
  // present the secret itself.
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return new Response("Not found", { status: 404 });
  }

  const reclaimed = await reclaimStaleJobs();
  const queued = await scheduleReminders();

  let done = 0;
  let failed = 0;

  for (const job of await claimJobs("vercel-cron", BATCH, LEASE_SECONDS)) {
    try {
      await runJob(job);
      await completeJob(job.id);
      done++;
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      await failJob({
        id: job.id,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        // Same rule as the worker: anything not explicitly permanent is worth
        // retrying, because losing a client's confirmation costs more than a
        // duplicate attempt.
        retryable: true,
        error,
      });
      failed++;
      console.error(`[cron] ${job.type} ${job.id} failed: ${error}`);
    }
  }

  return Response.json({ reclaimed, queued, done, failed });
}
