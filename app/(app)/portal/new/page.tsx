import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { listClients } from "@/lib/db/repo/clients";
import { listShoots } from "@/lib/db/repo/shoots";
import { getSettings, listBlackouts } from "@/lib/db/repo/settings";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { submitRequestAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ reshoot?: string }>;
}) {
  const { ctx } = await requirePageRole("client");
  const { locale, t } = await getT();
  const { reshoot } = await searchParams;

  const [clients, settings, blackouts, past] = await Promise.all([
    listClients(ctx),
    getSettings(),
    listBlackouts(),
    // Only shoots that actually happened can be redone.
    listShoots(ctx, { status: ["completed", "delivered"], limit: 30 }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const closedDays = Object.entries(settings.workingHours)
    .filter(([, ranges]) => !ranges || ranges.length === 0)
    .map(([day]) => t.weekday[day as keyof typeof t.weekday]);

  return (
    <div className="hue-stagger mx-auto max-w-2xl">
      <PageHeader
        eyebrow={t.app.name}
        title={t.nav.newRequest}
        subtitle={t.shoot.briefHint}
      />

      {/* Told up front, not enforced by a disabled date picker: a client with
          a genuine reason to ask for a Friday should still be able to ask. */}
      {closedDays.length > 0 || blackouts.length > 0 ? (
        <div className="mb-6">
          <Notice tone="warn">
            <p className="font-medium">{t.settings.blackouts}</p>
            <p className="mt-1 text-xs">
              {closedDays.length > 0 ? `${t.settings.closed}: ${closedDays.join("، ")}` : null}
              {blackouts.length > 0 ? (
                <>
                  {closedDays.length > 0 ? " · " : null}
                  <span className="tabular">
                    {blackouts
                      .filter((b) => b.day >= today)
                      .slice(0, 6)
                      .map((b) => b.day)
                      .join("، ")}
                  </span>
                </>
              ) : null}
            </p>
          </Notice>
        </div>
      ) : null}

      <Card>
        <ActionForm
          action={submitRequestAction}
          submitLabel={t.shoot.submitRequest}
          loadingLabel={t.common.saving}
        >
          {clients.length > 1 ? (
            <Field label={t.shoot.newFor}>
              <Select name="clientId" defaultValue={clients[0]?.id}>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="clientId" value={clients[0]?.id ?? ""} />
          )}

          {/* The one required field in the whole form. */}
          <Field label={`${t.shoot.title} · ${t.common.required}`}>
            <Input name="title" required placeholder={t.shoot.titlePlaceholder} />
          </Field>

          <Field label={t.shoot.kind}>
            <Select name="kind" defaultValue="">
              <option value="">{t.common.none}</option>
              <option value="photo">{t.shootKind.photo}</option>
              <option value="video">{t.shootKind.video}</option>
              <option value="both">{t.shootKind.both}</option>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`${t.shoot.requestedDate} · ${t.common.optional}`}>
              <Input name="requestedDate" type="date" min={today} dir="ltr" />
            </Field>
            <Field label={`${t.shoot.requestedTime} · ${t.common.optional}`}>
              <Input name="requestedTime" type="time" dir="ltr" />
            </Field>
          </div>

          <Field label={t.shoot.location}>
            <Select name="locationKind" defaultValue="">
              <option value="">{t.common.none}</option>
              <option value="studio">{t.locationKind.studio}</option>
              <option value="on_location">{t.locationKind.on_location}</option>
            </Select>
          </Field>
          <Field label={t.shoot.address}>
            <Input name="address" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.shoot.cameraCount}>
              <Input name="cameraCount" type="number" min={0} />
            </Field>
            <Field label={t.shoot.reelsRequired}>
              <Input name="reelsRequired" type="number" min={0} />
            </Field>
            <Field label={t.shoot.photosRequired}>
              <Input name="photosRequired" type="number" min={0} />
            </Field>
          </div>

          <Field label={t.shoot.products}>
            <Textarea name="products" rows={2} />
          </Field>
          <Field label={t.shoot.moodboard}>
            <Input name="moodboardUrl" type="url" dir="ltr" placeholder="https://" />
          </Field>
          <Field label={t.shoot.requestedNotes}>
            <Textarea name="requestedNotes" rows={3} />
          </Field>

          {past.length > 0 ? (
            <>
              <Field label={t.shoot.reshootOf} hint={t.shoot.isReshoot}>
                <Select name="parentShootId" defaultValue={reshoot ?? ""}>
                  <option value="">{t.common.none}</option>
                  {past.map((shoot) => (
                    <option key={shoot.id} value={shoot.id}>
                      {shoot.ref} — {shoot.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.shoot.reshootReason}>
                <Input name="reshootReason" />
              </Field>
            </>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {locale === "ar"
              ? "بعد الإرسال هيوصلك تأكيد رسمي فيه الموعد والتفاصيل المعتمدة."
              : "Once approved you will get a formal confirmation with the agreed date and details."}
          </p>
        </ActionForm>
      </Card>
    </div>
  );
}
