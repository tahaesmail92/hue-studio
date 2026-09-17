import { notFound } from "next/navigation";
import { formatDate } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { clientContacts, getClient, visitCounts, visitsByYear } from "@/lib/db/repo/clients";
import { listShoots } from "@/lib/db/repo/shoots";
import { whenLine } from "@/lib/shoot-view";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { ShootRow } from "@/components/shoot-bits";
import {
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pill,
  Select,
  Stat,
  Textarea,
} from "@/components/ui";
import {
  inviteContactAction,
  resendInviteAction,
  updateClientAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ClientFilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx } = await requirePageRole("admin", "producer");
  const { locale, t } = await getT();

  const client = await getClient(ctx, id);
  if (!client) notFound();

  const [contacts, counts, byYear, shoots] = await Promise.all([
    clientContacts(ctx, id),
    visitCounts(ctx, id),
    visitsByYear(ctx, id),
    listShoots(ctx, { clientId: id, limit: 50 }),
  ]);

  return (
    <div className="hue-stagger">
      <PageHeader
        eyebrow={t.client.file}
        title={client.name}
        subtitle={client.sector ?? undefined}
      />

      {/* The visit counter the spec asks for, derived on read rather than
          stored - a counter column drifts the first time a shoot moves. */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.client.visitsDay} value={counts.today} />
        <Stat label={t.client.visitsWeek} value={counts.week} />
        <Stat label={t.client.visitsMonth} value={counts.month} />
        <Stat label={t.client.visitsYear} value={counts.year} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-0">
            <CardHeader title={t.shoot.many} count={shoots.length} />
            {shoots.length === 0 ? (
              <div className="p-6">
                <EmptyState title={t.shoot.noShoots} body={t.client.contactHint} />
              </div>
            ) : (
              shoots.map((shoot) => (
                <ShootRow
                  key={shoot.id}
                  href={`/requests/${shoot.id}`}
                  reference={shoot.ref}
                  title={shoot.title}
                  when={whenLine(shoot, locale)}
                  status={shoot.status}
                  statusLabel={t.shootStatus[shoot.status]}
                />
              ))
            )}
          </Card>

          {byYear.length > 0 ? (
            <Card>
              <h2 className="mb-4 font-display text-base font-semibold">{t.client.byYear}</h2>
              <div className="flex flex-wrap gap-6">
                {byYear.map((row) => (
                  <div key={row.year}>
                    <p className="hue-eyebrow">{row.year}</p>
                    <p className="mt-1 font-display text-2xl font-black tabular">{row.count}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="p-0">
            <CardHeader title={t.client.contacts} count={contacts.length} />
            <div className="divide-y divide-border">
              {contacts.map((contact) => (
                <div
                  key={contact.userId}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{contact.fullName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground ltr">{contact.email}</p>
                  </div>

                  {/* Three honest states, not one vague "pending". */}
                  {!contact.active ? (
                    <Pill tone="danger">{t.common.suspended}</Pill>
                  ) : contact.activated ? (
                    <span className="text-xs text-muted-foreground">
                      {contact.lastLoginAt
                        ? formatDate(contact.lastLoginAt, locale, client.timezone)
                        : t.common.never}
                    </span>
                  ) : (
                    <Pill tone="warn">{t.client.inviteWaiting}</Pill>
                  )}

                  <ActionButton
                    action={resendInviteAction}
                    label={t.client.reinvite}
                    loadingLabel={t.common.saving}
                    hidden={{
                      userId: contact.userId,
                      email: contact.email,
                      fullName: contact.fullName,
                    }}
                  />
                </div>
              ))}

              <div className="px-5 py-5">
                <h3 className="mb-3 text-sm font-medium">{t.client.addContact}</h3>
                <ActionForm
                  action={inviteContactAction}
                  submitLabel={t.client.invite}
                  loadingLabel={t.common.saving}
                  hidden={{ clientId: client.id }}
                  resetOnSuccess
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t.common.name}>
                      <Input name="fullName" required />
                    </Field>
                    <Field label={t.common.email} hint={t.client.contactHint}>
                      <Input name="email" type="email" required dir="ltr" className="text-start" />
                    </Field>
                  </div>
                </ActionForm>
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <h2 className="mb-4 font-display text-base font-semibold">{t.common.edit}</h2>
          <ActionForm
            action={updateClientAction}
            submitLabel={t.common.save}
            loadingLabel={t.common.saving}
            hidden={{ id: client.id }}
          >
            <Field label={t.client.company}>
              <Input name="name" defaultValue={client.name} required />
            </Field>
            <Field label={t.client.sector}>
              <Input name="sector" defaultValue={client.sector ?? ""} />
            </Field>
            <Field label={t.client.timezone}>
              <Select name="timezone" defaultValue={client.timezone}>
                <option value="Africa/Cairo">{locale === "ar" ? "القاهرة" : "Cairo"}</option>
                <option value="Asia/Riyadh">{locale === "ar" ? "الرياض" : "Riyadh"}</option>
                <option value="Asia/Dubai">{locale === "ar" ? "دبي" : "Dubai"}</option>
              </Select>
            </Field>
            <Field label={t.common.status}>
              <Select name="status" defaultValue={client.status}>
                <option value="active">{t.clientStatus.active}</option>
                <option value="paused">{t.clientStatus.paused}</option>
                <option value="archived">{t.clientStatus.archived}</option>
              </Select>
            </Field>
            <Field label={t.client.preferences} hint={t.client.preferencesHint}>
              <Textarea name="notes" rows={4} defaultValue={client.notes ?? ""} />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
