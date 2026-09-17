import { env } from "./env.ts";
import { enqueue } from "./db/repo/jobs.ts";
import { notify } from "./db/repo/notifications.ts";
import { staffEmails } from "./db/repo/users.ts";
import { shootAudience, type Assignment, type Shoot } from "./db/repo/shoots.ts";
import { dictionaryFor } from "./i18n/index.ts";
import {
  confirmationEmail,
  deliveredEmail,
  newRequestEmail,
  rejectedEmail,
} from "./mail/templates.ts";
import { toSummary, whenLine } from "./shoot-view.ts";
import type { Locale } from "./types.ts";

/**
 * Telling people what happened.
 *
 * Every email is queued rather than sent inline: a producer clicking Confirm
 * should not wait on a mail provider, and a provider having a bad minute must
 * not cost a client their confirmation. The in-app notification is written
 * directly, because that one is just a row.
 */

function shootUrl(shoot: Shoot, forClient: boolean): string {
  return forClient
    ? `${env.appUrl}/portal/${shoot.id}`
    : `${env.appUrl}/requests/${shoot.id}`;
}

async function queueEmail(message: unknown, shootId: string): Promise<void> {
  await enqueue({
    type: "send_email",
    payload: { ...(message as Record<string, unknown>), shootId },
  });
}

/** A client has submitted. Production hears about it immediately. */
export async function announceNewRequest(shoot: Shoot): Promise<void> {
  const recipients = env.adminEmail ? [env.adminEmail] : await staffEmails();

  for (const to of recipients) {
    // Production reads the system in Arabic; a per-recipient locale would mean
    // a lookup per address for no real gain here.
    const locale: Locale = env.defaultLocale as Locale;
    await queueEmail(
      newRequestEmail({
        to,
        shoot: {
          ref: shoot.ref,
          title: shoot.title,
          clientName: shoot.clientName,
          when: whenLine(shoot, locale),
          location: "",
          crew: "",
          timezoneLabel: "",
        },
        requestedWhen: whenLine(shoot, locale),
        url: shootUrl(shoot, false),
        locale,
      }),
      shoot.id,
    );
  }

  const audience = await shootAudience(shoot.id);
  const staffIds = audience.filter((p) => p.role === "admin" || p.role === "producer");
  const t = dictionaryFor(env.defaultLocale as Locale);
  await notify({
    userIds: staffIds.map((p) => p.userId),
    type: "new_request",
    title: `${t.nav.requests}: ${shoot.title}`,
    body: shoot.clientName,
    link: `/requests/${shoot.id}`,
    shootId: shoot.id,
  });
}

/**
 * Confirmed, or moved. Both send the same document because both settle the
 * same question - only the opening line differs.
 */
export async function announceConfirmation(
  shoot: Shoot,
  assignments: Assignment[],
  options: { rescheduled?: boolean } = {},
): Promise<void> {
  const audience = await shootAudience(shoot.id);

  for (const person of audience) {
    if (person.role !== "client") continue;
    await queueEmail(
      confirmationEmail({
        to: person.email,
        shoot: toSummary(shoot, assignments, person.locale),
        url: `${env.appUrl}/c/${shoot.confirmToken}`,
        locale: person.locale,
        rescheduled: options.rescheduled,
      }),
      shoot.id,
    );
  }

  // Crew are told in-app rather than by email: they live in the schedule, and
  // a mail per assignment is the fastest way to make them stop reading any.
  for (const person of audience) {
    const forClient = person.role === "client";
    const t = dictionaryFor(person.locale);
    await notify({
      userIds: [person.userId],
      type: options.rescheduled ? "rescheduled" : "confirmed",
      title: options.rescheduled
        ? `${t.event.rescheduled}: ${shoot.title}`
        : `${t.event.confirmed}: ${shoot.title}`,
      body: whenLine(shoot, person.locale),
      link: forClient ? `/portal/${shoot.id}` : `/crew/${shoot.id}`,
      shootId: shoot.id,
    });
  }
}

export async function announceDelivered(
  shoot: Shoot,
  assignments: Assignment[],
): Promise<void> {
  const audience = await shootAudience(shoot.id);

  for (const person of audience) {
    if (person.role !== "client") continue;
    const t = dictionaryFor(person.locale);

    await queueEmail(
      deliveredEmail({
        to: person.email,
        shoot: toSummary(shoot, assignments, person.locale),
        url: `${env.appUrl}/portal/${shoot.id}`,
        locale: person.locale,
      }),
      shoot.id,
    );
    await notify({
      userIds: [person.userId],
      type: "delivered",
      title: `${t.event.delivered}: ${shoot.title}`,
      link: `/portal/${shoot.id}`,
      shootId: shoot.id,
    });
  }
}

/**
 * A refusal still gets a proper message with the reason in it. "Rejected" with
 * no explanation is how an agency loses a client it could have kept.
 */
export async function announceRejected(shoot: Shoot, reason: string): Promise<void> {
  const audience = await shootAudience(shoot.id);

  for (const person of audience) {
    if (person.role !== "client") continue;
    const t = dictionaryFor(person.locale);

    await queueEmail(
      rejectedEmail({
        to: person.email,
        shoot: toSummary(shoot, [], person.locale),
        reason,
        locale: person.locale,
      }),
      shoot.id,
    );
    await notify({
      userIds: [person.userId],
      type: "rejected",
      title: `${t.event.rejected}: ${shoot.title}`,
      body: reason,
      link: `/portal/${shoot.id}`,
      shootId: shoot.id,
    });
  }
}

/** The client accepted the final cut - production wants to know it closed. */
export async function announceApproval(shoot: Shoot): Promise<void> {
  const staff = (await shootAudience(shoot.id)).filter(
    (p) => p.role === "admin" || p.role === "producer",
  );
  const t = dictionaryFor(env.defaultLocale as Locale);

  await notify({
    userIds: staff.map((p) => p.userId),
    type: "approved",
    title: `${t.event.approved}: ${shoot.title}`,
    body: shoot.clientName,
    link: `/requests/${shoot.id}`,
    shootId: shoot.id,
  });
}
