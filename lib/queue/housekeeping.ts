import { pruneFinishedJobs } from "../db/repo/jobs.ts";
import { prunePastInvites } from "../db/repo/invites.ts";
import { pruneExpiredSessions, pruneLoginAttempts } from "../db/repo/sessions.ts";

/**
 * Deleting what has stopped mattering: expired sessions, old login attempts,
 * consumed invites, finished jobs.
 *
 * It lives here rather than in the worker because the worker imports the
 * handler registry and the registry dispatches to this - putting it in
 * worker/index.ts made the two import each other.
 */
export async function runHousekeeping(): Promise<void> {
  const [sessions, attempts, invites, jobs] = await Promise.all([
    pruneExpiredSessions(),
    pruneLoginAttempts(),
    prunePastInvites(),
    pruneFinishedJobs(),
  ]);
  console.info(
    `[worker] housekeeping: -${sessions} sessions, -${attempts} attempts, ` +
      `-${invites} invites, -${jobs} finished jobs`,
  );
}
