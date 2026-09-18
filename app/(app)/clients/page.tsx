import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { env } from "@/lib/env";
import { requirePageRole } from "@/lib/auth/session";
import { listClients } from "@/lib/db/repo/clients";
import { ActionForm } from "@/components/ActionForm";
import { Card, CardHeader, EmptyState, Field, Input, PageHeader, Pill, Select, Textarea } from "@/components/ui";
import { createClientAction } from "./actions";

export const dynamic = "force-dynamic";

// The two the agency actually works across. A free-text IANA name would be a
// support ticket waiting to happen.
const TIMEZONES = [
  { value: "Africa/Cairo", ar: "القاهرة", en: "Cairo" },
  { value: "Asia/Riyadh", ar: "الرياض", en: "Riyadh" },
  { value: "Asia/Dubai", ar: "دبي", en: "Dubai" },
];

export default async function ClientsPage() {
  const { ctx } = await requirePageRole("admin", "producer");
  const { locale, t } = await getT();
  const clients = await listClients(ctx, true);

  return (
    <div className="hue-stagger">
      <PageHeader eyebrow={t.app.name} title={t.client.many} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-0">
          <CardHeader title={t.client.many} count={clients.length} />
          {clients.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t.client.none} body={t.client.contactHint} />
            </div>
          ) : (
            <div>
              {clients.map((client) => (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-5 py-4
                             transition last:border-0 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{client.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {client.sector ?? t.common.none}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {TIMEZONES.find((z) => z.value === client.timezone)?.[locale] ??
                      client.timezone}
                  </span>
                  {client.status === "active" ? null : (
                    <Pill tone="neutral">{t.clientStatus[client.status]}</Pill>
                  )}
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-base font-semibold">{t.client.add}</h2>
          <ActionForm
            action={createClientAction}
            submitLabel={t.common.add}
            loadingLabel={t.common.saving}
            resetOnSuccess
          >
            <Field label={t.client.company}>
              <Input name="name" required />
            </Field>
            <Field label={t.client.sector}>
              <Input name="sector" />
            </Field>
            <Field label={t.client.timezone}>
              {/* Pre-selects the zone most of this agency's clients are in. */}
              <Select name="timezone" defaultValue={env.defaultTimezone}>
                {TIMEZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone[locale]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.client.preferences} hint={t.client.preferencesHint}>
              <Textarea name="notes" rows={3} />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
