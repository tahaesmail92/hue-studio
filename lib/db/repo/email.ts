import { query } from "../index.ts";

export type EmailStatus = "sent" | "skipped" | "failed";

/**
 * Every attempt is recorded, including the ones that were skipped because no
 * provider key is configured. Without this, "we emailed you the confirmation"
 * is an assertion; with it, it is a record with a timestamp.
 */
export async function logEmail(input: {
  to: string;
  subject: string;
  template: string;
  shootId?: string | null;
  status: EmailStatus;
  error?: string | null;
}): Promise<void> {
  await query(
    `insert into email_log (to_email, subject, template, shoot_id, status, error)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      input.to,
      input.subject,
      input.template,
      input.shootId ?? null,
      input.status,
      input.error ?? null,
    ],
  );
}

export type EmailLogRow = {
  id: string;
  to_email: string;
  subject: string;
  template: string;
  status: EmailStatus;
  error: string | null;
  created_at: Date;
};

export async function emailsForShoot(shootId: string): Promise<EmailLogRow[]> {
  return query<EmailLogRow>(
    `select id, to_email, subject, template, status, error, created_at
       from email_log where shoot_id = $1 order by created_at desc`,
    [shootId],
  );
}
