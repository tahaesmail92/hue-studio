import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { getSettings, listBlackouts } from "@/lib/db/repo/settings";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { Card, Checkbox, Field, Input, PageHeader } from "@/components/ui";
import { addBlackoutAction, removeBlackoutAction, saveSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePageRole("admin");
  const { t } = await getT();

  const [settings, blackouts] = await Promise.all([getSettings(), listBlackouts()]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="hue-stagger">
      <PageHeader eyebrow={t.app.name} title={t.nav.settings} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <ActionForm
            action={saveSettingsAction}
            submitLabel={t.common.save}
            loadingLabel={t.common.saving}
          >
            <h2 className="font-display text-base font-semibold">{t.settings.company}</h2>
            <Field label={t.settings.companyName}>
              <Input name="companyName" defaultValue={settings.companyName} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.common.email}>
                <Input
                  name="companyEmail"
                  type="email"
                  defaultValue={settings.companyEmail ?? ""}
                  dir="ltr"
                  className="text-start"
                />
              </Field>
              <Field label={t.common.phone}>
                <Input
                  name="companyPhone"
                  defaultValue={settings.companyPhone ?? ""}
                  dir="ltr"
                  className="text-start"
                />
              </Field>
            </div>
            <Field label={t.shoot.address}>
              <Input name="companyAddress" defaultValue={settings.companyAddress ?? ""} />
            </Field>

            <h2 className="pt-4 font-display text-base font-semibold">
              {t.settings.workingHours}
            </h2>
            <p className="-mt-2 text-xs text-muted-foreground">{t.settings.workingHoursHint}</p>
            <div className="space-y-2">
              {[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
                const key = String(weekday) as keyof typeof t.weekday;
                const ranges = settings.workingHours[String(weekday)] ?? [];
                const [open, close] = ranges[0] ?? ["", ""];
                return (
                  <div key={weekday} className="flex flex-wrap items-center gap-3">
                    <span className="w-20 shrink-0 text-sm">{t.weekday[key]}</span>
                    <Input
                      name={`open-${weekday}`}
                      type="time"
                      defaultValue={open}
                      dir="ltr"
                      className="w-32"
                    />
                    <Input
                      name={`close-${weekday}`}
                      type="time"
                      defaultValue={close}
                      dir="ltr"
                      className="w-32"
                    />
                    {ranges.length === 0 ? (
                      <span className="text-xs text-muted-foreground">{t.settings.closed}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <h2 className="pt-4 font-display text-base font-semibold">{t.settings.defaults}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.settings.setupDefault}>
                <Input
                  name="defaultSetupMinutes"
                  type="number"
                  min={0}
                  defaultValue={settings.defaultSetupMinutes}
                />
              </Field>
              <Field label={t.settings.teardownDefault}>
                <Input
                  name="defaultTeardownMinutes"
                  type="number"
                  min={0}
                  defaultValue={settings.defaultTeardownMinutes}
                />
              </Field>
              <Field label={t.settings.durationDefault}>
                <Input
                  name="defaultDurationMinutes"
                  type="number"
                  min={15}
                  defaultValue={settings.defaultDurationMinutes}
                />
              </Field>
            </div>

            <h2 className="pt-4 font-display text-base font-semibold">{t.settings.reminders}</h2>
            <Field label={t.settings.reminderOffsets}>
              <Input
                name="reminderOffsetsHours"
                defaultValue={settings.reminderOffsetsHours.join(", ")}
                dir="ltr"
                className="text-start"
              />
            </Field>

            <div className="pt-2">
              <Checkbox
                name="allowSelfReset"
                defaultChecked={settings.allowSelfReset}
                label={t.settings.allowSelfReset}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t.settings.allowSelfResetHint}
              </p>
            </div>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="mb-1 font-display text-base font-semibold">{t.settings.blackouts}</h2>
          <p className="mb-4 text-xs text-muted-foreground">{t.settings.blackoutsHint}</p>

          <ActionForm
            action={addBlackoutAction}
            submitLabel={t.settings.addBlackout}
            loadingLabel={t.common.saving}
            resetOnSuccess
          >
            <Field label={t.common.date}>
              <Input name="day" type="date" required dir="ltr" />
            </Field>
            <Field label={t.settings.reason}>
              <Input name="reason" />
            </Field>
          </ActionForm>

          <div className="mt-6 divide-y divide-border border-t border-border">
            {blackouts
              .filter((blackout) => blackout.day >= today)
              .map((blackout) => (
                <div key={blackout.day} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm tabular">{blackout.day}</p>
                    {blackout.reason ? (
                      <p className="truncate text-xs text-muted-foreground">{blackout.reason}</p>
                    ) : null}
                  </div>
                  <ActionButton
                    action={removeBlackoutAction}
                    label={t.common.delete}
                    loadingLabel={t.common.saving}
                    variant="danger"
                    hidden={{ day: blackout.day }}
                  />
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
