import type { Job } from "../db/repo/jobs.ts";
import { runHousekeeping } from "./housekeeping.ts";
import { sendEmail, type Message } from "../mail/send.ts";

/**
 * What each job type actually does.
 *
 * Handlers throw on failure and the worker decides whether to retry; they
 * return nothing on success. Keeping the decision in the worker rather than in
 * each handler is what makes retry behaviour uniform.
 */
export async function runJob(job: Job): Promise<void> {
  switch (job.type) {
    case "send_email":
      return sendQueuedEmail(job);

    case "shoot_reminder":
      // Raised by the scheduler once per reminder offset. Filled in with the
      // reminder templates - the queue plumbing it rides on is already here.
      throw new Error("shoot_reminder has no handler yet");

    case "housekeeping":
      return runHousekeeping();

    default: {
      // An unknown type means a deploy removed a handler while jobs of that
      // type were still queued. Exhaustiveness is checked at compile time.
      const unreachable: never = job.type;
      throw new Error(`No handler for job type ${String(unreachable)}`);
    }
  }
}

/**
 * The payload is the whole message, built by whoever queued it. Rendering the
 * template at enqueue time rather than at send time means a reminder says what
 * was true when it was raised, and a template change never rewrites history.
 */
async function sendQueuedEmail(job: Job): Promise<void> {
  const message = job.payload as unknown as Message;
  if (!message?.to || !message.subject) {
    throw new Error("send_email payload is not a message");
  }

  const result = await sendEmail(message);
  // "skipped" is a success: it means no provider is configured, which is the
  // normal state in development and is already recorded in email_log.
  if (result.status === "failed") {
    throw new Error(result.error ?? "the mail provider refused the message");
  }
}
