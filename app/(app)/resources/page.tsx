import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { listResources } from "@/lib/db/repo/resources";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import {
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pill,
  Select,
  Textarea,
} from "@/components/ui";
import {
  createResourceAction,
  reactivateResourceAction,
  retireResourceAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const { ctx } = await requirePageRole("admin", "producer");
  const { t } = await getT();
  const resources = await listResources(ctx);

  const groups = (["person", "studio", "equipment"] as const).map((kind) => ({
    kind,
    items: resources.filter((r) => r.kind === kind),
  }));

  return (
    <div className="hue-stagger">
      <PageHeader eyebrow={t.app.name} title={t.resource.many} subtitle={t.resource.hint} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {resources.length === 0 ? (
            <EmptyState title={t.resource.none} body={t.resource.hint} />
          ) : (
            groups
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <Card key={group.kind} className="p-0">
                  <CardHeader title={t.resourceKind[group.kind]} count={group.items.length} />
                  <div className="divide-y divide-border">
                    {group.items.map((resource) => (
                      <div
                        key={resource.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{resource.name}</p>
                          {resource.craft || resource.notes ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {resource.craft ? t.craft[resource.craft] : null}
                              {resource.craft && resource.notes ? " · " : null}
                              {resource.notes}
                            </p>
                          ) : null}
                        </div>

                        {resource.active ? (
                          <ActionButton
                            action={retireResourceAction}
                            label={t.resource.retire}
                            loadingLabel={t.common.saving}
                            hidden={{ id: resource.id }}
                          />
                        ) : (
                          <>
                            <Pill tone="neutral">{t.resource.retired}</Pill>
                            <ActionButton
                              action={reactivateResourceAction}
                              label={t.common.active}
                              loadingLabel={t.common.saving}
                              hidden={{ id: resource.id }}
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              ))
          )}
        </div>

        <Card>
          <h2 className="mb-4 font-display text-base font-semibold">{t.resource.add}</h2>
          <ActionForm
            action={createResourceAction}
            submitLabel={t.common.add}
            loadingLabel={t.common.saving}
            resetOnSuccess
          >
            <Field label={t.resource.kind}>
              {/* A person made here is bookable but has no login; to create
                  both at once, use the crew page. */}
              <Select name="kind" defaultValue="studio">
                <option value="studio">{t.resourceKind.studio}</option>
                <option value="equipment">{t.resourceKind.equipment}</option>
                <option value="person">{t.resourceKind.person}</option>
              </Select>
            </Field>
            <Field label={t.common.name}>
              <Input name="name" required placeholder={t.resource.namePlaceholder} />
            </Field>
            <Field label={t.resource.craft} hint={t.crewPage.hint}>
              <Select name="craft" defaultValue="">
                <option value="">{t.common.none}</option>
                <option value="photographer">{t.craft.photographer}</option>
                <option value="videographer">{t.craft.videographer}</option>
                <option value="editor">{t.craft.editor}</option>
              </Select>
            </Field>
            <Field label={t.common.notes}>
              <Textarea name="notes" rows={2} />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
