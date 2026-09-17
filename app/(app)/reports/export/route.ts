import { getT } from "@/lib/i18n/server";
import { requireStaff } from "@/lib/auth/session";
import { crewLoad, volumeByClient } from "@/lib/db/repo/reports";

export const dynamic = "force-dynamic";

/** RFC 4180 quoting: a client named "Acme, Ltd" must not split into two cells. */
function cell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

export async function GET(request: Request) {
  const { ctx } = await requireStaff();
  const { t } = await getT();

  const range = new URL(request.url).searchParams.get("range") ?? "month";
  const now = new Date();
  const from =
    range === "year"
      ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
      : range === "last30"
        ? new Date(now.getTime() - 30 * 86_400_000)
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to =
    range === "year"
      ? new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1))
      : range === "last30"
        ? now
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [clients, crew] = await Promise.all([
    volumeByClient(ctx, from, to),
    crewLoad(ctx, from, to),
  ]);

  const rows: (string | number)[][] = [
    [t.reports.byClient],
    [t.client.one, t.shoot.many, t.reports.completed, t.reports.cancelled],
    ...clients.map((row) => [row.clientName, row.shoots, row.completed, row.cancelled]),
    [],
    [t.reports.crewLoad],
    [t.common.name, t.resource.craft, t.shoot.many, t.reports.hours, t.reports.reshoots],
    // The craft comes back as its enum value; the spreadsheet gets the label a
    // person reads, in whichever language they are working in.
    ...crew.map((row) => [
      row.name,
      row.craft ? t.craft[row.craft as keyof typeof t.craft] : "",
      row.shoots,
      row.hours,
      row.reshoots,
    ]),
  ];

  // Excel reads a UTF-8 CSV as the system codepage unless it sees a BOM, which
  // turns every Arabic client name into mojibake.
  const body = "﻿" + toCsv(rows);

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hue-studio-${range}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
