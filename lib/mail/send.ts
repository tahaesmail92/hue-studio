import { env } from "../env.ts";
import { logEmail } from "../db/repo/email.ts";

/**
 * Resend over plain fetch. No SDK: one POST is not worth a dependency, and
 * this keeps the production image smaller.
 *
 * Without RESEND_API_KEY the send is recorded as "skipped" and the caller
 * carries on. Local development must never block on an email provider, and in
 * production a missing key shows up in the email log rather than as a crash.
 */
export type Message = {
  to: string;
  subject: string;
  html: string;
  text: string;
  template: string;
  shootId?: string | null;
};

export type SendResult = { status: "sent" | "skipped" | "failed"; error?: string };

export async function sendEmail(message: Message): Promise<SendResult> {
  if (!env.resendApiKey) {
    await logEmail({ ...message, status: "skipped" });
    console.info(`[mail] skipped (no RESEND_API_KEY): ${message.template} -> ${message.to}`);
    return { status: "skipped" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const error = `${response.status} ${(await response.text()).slice(0, 500)}`;
      await logEmail({ ...message, status: "failed", error });
      return { status: "failed", error };
    }

    await logEmail({ ...message, status: "sent" });
    return { status: "sent" };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await logEmail({ ...message, status: "failed", error });
    return { status: "failed", error };
  }
}
