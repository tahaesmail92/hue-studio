import { enqueue } from "../db/repo/jobs.ts";
import { getSettings } from "../db/repo/settings.ts";
import {
  assignmentsByToken,
  claimReminder,
  getShootUnscoped,
  shootAudience,
  shootsDueForReminder,
} from "../db/repo/shoots.ts";
import { notify } from "../db/repo/notifications.ts";
import { env } from "../env.ts";
import { dictionaryFor } from "../i18n/index.ts";
import { reminderEmail } from "../mail/templates.ts";
import { toSummary } from "../shoot-view.ts";

/**
 * "It is time to remind someone."
 *
 * Deliberately dumb: it finds shoots whose reminder moment has arrived and
 * queues one job each. All the judgement about what to say lives in the
 * templates, and the dedupe key is what makes running this every tick safe -
 * a shoot already reminded at 24 hours simply produces nothing.
 */
export async function scheduleReminders(): Promise<number> {
  const settings = await getSettings();
  let queued = 0;

  for (const hours of settings.reminderOffsetsHours) {
    for (const shoot of await shootsDueForReminder(hours)) {
      const created = await enqueue({
        type: "shoot_reminder",
        payload: { shootId: shoot.shootId, hoursBefore: hours },
        // Guards against two ticks queueing the same work at once. The
        // permanent record is shoot_reminders, claimed when the job runs -
        // this key frees as soon as the job finishes.
        dedupeKey: `remind:${shoot.shootId}:${hours}`,
      });
      if (created) queued++;
    }
  }

  return queued;
}

/**
 * Sending one.
 *
 * The recipient list is the shoot's own audience - the client contacts and the
 * booked crew - so nobody is reminded about a day they have nothing to do
 * with. Clients get an email and a notification; crew get the notification,
 * because they live in the schedule and a mail per booking is the fastest way
 * to make them stop reading any of them.
 */
export async function sendReminder(shootId: string, hoursBefore: number): Promise<void> {
  const shoot = await getShootUnscoped(shootId);
  // Cancelled between the job being queued and it running: nothing to say.
  if (!shoot || shoot.status !== "confirmed") return;

  // The claim is what makes this send-once. Taken before anything is written,
  // so a crash halfway through drops a reminder rather than repeating it.
  if (!(await claimReminder(shootId, hoursBefore))) return;

  const [audience, assignments] = await Promise.all([
    shootAudience(shootId),
    assignmentsByToken(shoot.confirmToken),
  ]);

  for (const person of audience) {
    const summary = toSummary(shoot, assignments, person.locale);
    const t = dictionaryFor(person.locale);

    if (person.role === "client") {
      await enqueue({
        type: "send_email",
        payload: {
          ...reminderEmail({
            to: person.email,
            shoot: summary,
            hoursBefore,
            url: `${env.appUrl}/c/${shoot.confirmToken}`,
            locale: person.locale,
          }),
          shootId,
        },
        dedupeKey: `remind-mail:${shootId}:${hoursBefore}:${person.userId}`,
      });
    }

    await notify({
      userIds: [person.userId],
      type: "reminder",
      title: `${t.event.reminder}: ${shoot.title}`,
      body: summary.when,
      link: person.role === "client" ? `/portal/${shootId}` : `/crew/${shootId}`,
      shootId,
    });
  }
}
