// Retry policy, kept pure so it can be reasoned about and tested without a
// database.
//
// The shape matters: a mail provider that is briefly unavailable should be
// retried soon, but one that keeps refusing should be left alone long enough
// that we are not hammering it - and then given up on loudly rather than
// retried forever in silence. A confirmation that never arrives must end up
// in the dead letter where someone can see it.

export const BACKOFF_STEPS_MS = [
  60_000, // 1m
  300_000, // 5m
  1_500_000, // 25m
  7_200_000, // 2h
  21_600_000, // 6h
];

export const DEFAULT_MAX_ATTEMPTS = 5;

/** Full jitter: spreads a thundering herd of retries after an outage. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const index = Math.min(Math.max(attempt, 1), BACKOFF_STEPS_MS.length) - 1;
  const step = BACKOFF_STEPS_MS[index];
  return Math.round(step / 2 + random() * (step / 2));
}

export function nextRunAt(attempt: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + backoffMs(attempt));
}

/**
 * A job is only retried while attempts remain AND the failure looked
 * transient. A permanent rejection - an address that does not exist - must go
 * straight to the dead letter rather than burn five slots.
 */
export function shouldRetry(input: {
  attempts: number;
  maxAttempts: number;
  retryable: boolean;
}): boolean {
  return input.retryable && input.attempts < input.maxAttempts;
}
