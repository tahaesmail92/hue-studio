import { one, query } from "../index.ts";
import type { Ctx } from "../../types.ts";
import { assertStaff } from "../../types.ts";

/**
 * Working hours keyed by weekday, 0 = Sunday. Each value is a list of
 * [open, close] pairs in "HH:MM", so a day with a break can have two.
 * A missing key or an empty list means closed.
 */
export type WorkingHours = Record<string, [string, string][]>;

export type Settings = {
  companyName: string;
  companyEmail: string | null;
  companyPhone: string | null;
  companyAddress: string | null;
  logoUrl: string | null;
  workingHours: WorkingHours;
  defaultSetupMinutes: number;
  defaultTeardownMinutes: number;
  defaultDurationMinutes: number;
  reminderOffsetsHours: number[];
  allowSelfReset: boolean;
};

const SELECT = `select company_name             as "companyName",
                       company_email            as "companyEmail",
                       company_phone            as "companyPhone",
                       company_address          as "companyAddress",
                       logo_url                 as "logoUrl",
                       working_hours            as "workingHours",
                       default_setup_minutes    as "defaultSetupMinutes",
                       default_teardown_minutes as "defaultTeardownMinutes",
                       default_duration_minutes as "defaultDurationMinutes",
                       reminder_offsets_hours   as "reminderOffsetsHours",
                       allow_self_reset         as "allowSelfReset"
                  from settings where id = true`;

/**
 * No Ctx: the login page needs `allowSelfReset` before anyone is signed in,
 * and nothing in this row is sensitive. Writes are staff-only (below).
 */
export async function getSettings(): Promise<Settings> {
  const row = await one<Settings>(SELECT);
  if (!row) throw new Error("settings row is missing - did migration 0002 run?");
  return row;
}

export async function updateSettings(ctx: Ctx, patch: Partial<Settings>): Promise<void> {
  assertStaff(ctx);
  await query(
    `update settings set
       company_name             = coalesce($1, company_name),
       company_email            = coalesce($2, company_email),
       company_phone            = coalesce($3, company_phone),
       company_address          = coalesce($4, company_address),
       logo_url                 = coalesce($5, logo_url),
       working_hours            = coalesce($6, working_hours),
       default_setup_minutes    = coalesce($7, default_setup_minutes),
       default_teardown_minutes = coalesce($8, default_teardown_minutes),
       default_duration_minutes = coalesce($9, default_duration_minutes),
       reminder_offsets_hours   = coalesce($10, reminder_offsets_hours),
       allow_self_reset         = coalesce($11, allow_self_reset)
     where id = true`,
    [
      patch.companyName ?? null,
      patch.companyEmail ?? null,
      patch.companyPhone ?? null,
      patch.companyAddress ?? null,
      patch.logoUrl ?? null,
      patch.workingHours ? JSON.stringify(patch.workingHours) : null,
      patch.defaultSetupMinutes ?? null,
      patch.defaultTeardownMinutes ?? null,
      patch.defaultDurationMinutes ?? null,
      patch.reminderOffsetsHours ?? null,
      patch.allowSelfReset ?? null,
    ],
  );
}

// ---------------------------------------------------------------------------
// Closed days
// ---------------------------------------------------------------------------

export type Blackout = { day: string; reason: string | null };

/** `day` comes back as "YYYY-MM-DD" - see the date type parser in lib/db. */
export async function listBlackouts(from?: string, to?: string): Promise<Blackout[]> {
  if (from && to) {
    return query<Blackout>(
      "select day, reason from blackout_dates where day >= $1 and day < $2 order by day",
      [from, to],
    );
  }
  return query<Blackout>("select day, reason from blackout_dates order by day");
}

export async function addBlackout(ctx: Ctx, day: string, reason: string | null): Promise<void> {
  assertStaff(ctx);
  await query(
    `insert into blackout_dates (day, reason) values ($1, $2)
     on conflict (day) do update set reason = excluded.reason`,
    [day, reason],
  );
}

export async function removeBlackout(ctx: Ctx, day: string): Promise<void> {
  assertStaff(ctx);
  await query("delete from blackout_dates where day = $1", [day]);
}
