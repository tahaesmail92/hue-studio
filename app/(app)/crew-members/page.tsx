import { formatDate } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { listUsers } from "@/lib/db/repo/users";
import { listResources } from "@/lib/db/repo/resources";
import { impactOfDeletingPerson } from "@/lib/db/repo/purge";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { DangerZone } from "@/components/DangerZone";
import {
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pill,
  Select,
} from "@/components/ui";
import { createCrewAction } from "../resources/actions";
import { resendInviteAction } from "../clients/actions";
import { deletePersonAction } from "../danger-actions";

export const dynamic = "force-dynamic";

export default async function CrewPage() {
  const { ctx, user } = await requirePageRole("admin", "producer");
  const { locale, t } = await getT();

  const [crew, people] = await Promise.all([
    listUsers(ctx, "crew"),
    listResources(ctx, "person"),
  ]);

  // Only an administrator may delete, so only an administrator is told what a
  // delete would cost. One query per crew member, on a page that lists a team.
  const impacts = new Map(
    ctx.role === "admin"
      ? (
          await Promise.all(crew.map((member) => impactOfDeletingPerson(ctx, member.id)))
        ).flatMap((impact, index) => (impact ? [[crew[index].id, impact] as const] : []))
      : [],
  );

  // The resource is what gets booked; the account is what signs in. They are
  // created together, so showing the craft here means reading it off the
  // resource rather than duplicating it on the user.
  const craftFor = new Map(people.filter((p) => p.userId).map((p) => [p.userId!, p.craft]));

  return (
    <div className="hue-stagger">
      <PageHeader eyebrow={t.app.name} title={t.nav.crew} subtitle={t.crewPage.hint} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-0">
          <CardHeader title={t.nav.crew} count={crew.length} />
          {crew.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t.crewPage.none} body={t.crewPage.hint} />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {crew.map((member) => {
                const craft = craftFor.get(member.id);
                return (
                  <div
                    key={member.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{member.fullName}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="ltr">{member.email}</span>
                        {craft ? <span>· {t.craft[craft]}</span> : null}
                      </p>
                    </div>

                    {!member.active ? (
                      <Pill tone="danger">{t.common.suspended}</Pill>
                    ) : member.activated ? (
                      <span className="text-xs text-muted-foreground">
                        {member.lastLoginAt
                          ? formatDate(member.lastLoginAt, locale, user.timezone)
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
                        userId: member.id,
                        email: member.email,
                        fullName: member.fullName,
                      }}
                    />

                    {impacts.has(member.id) ? (
                      <div className="w-full">
                        <DangerZone
                          action={deletePersonAction}
                          hidden={{ userId: member.id }}
                          name={member.fullName}
                          lines={[
                            impacts.get(member.id)!.assignments
                              ? `${t.danger.assignments}: ${impacts.get(member.id)!.assignments}`
                              : "",
                          ].filter(Boolean)}
                          keeps={[
                            impacts.get(member.id)!.shootsAttributed
                              ? `${t.danger.shootsKept}: ${impacts.get(member.id)!.shootsAttributed}`
                              : "",
                          ].filter(Boolean)}
                          labels={{
                            zone: t.danger.zone,
                            action: t.danger.deletePerson,
                            irreversible: t.danger.irreversible,
                            willRemove: t.danger.willRemove,
                            nothingAttached: t.danger.nothingAttached,
                            willKeep: t.danger.willKeep,
                            typeToConfirm: t.danger.typeToConfirm,
                            alternative: t.danger.alternative,
                            cancel: t.common.cancel,
                            loading: t.common.saving,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-base font-semibold">{t.crewPage.add}</h2>
          <ActionForm
            action={createCrewAction}
            submitLabel={t.client.invite}
            loadingLabel={t.common.saving}
            resetOnSuccess
          >
            <Field label={t.common.name}>
              <Input name="fullName" required />
            </Field>
            <Field label={t.common.email} hint={t.client.contactHint}>
              <Input name="email" type="email" required dir="ltr" className="text-start" />
            </Field>
            <Field label={t.resource.craft}>
              <Select name="craft" defaultValue="photographer">
                <option value="photographer">{t.craft.photographer}</option>
                <option value="videographer">{t.craft.videographer}</option>
                <option value="editor">{t.craft.editor}</option>
              </Select>
            </Field>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
