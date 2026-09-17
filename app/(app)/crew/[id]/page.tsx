import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { getShoot, shootResources } from "@/lib/db/repo/shoots";
import { listDeliverables } from "@/lib/db/repo/deliverables";
import { crewLine, kitLine, locationLine, setupLine, whenLine } from "@/lib/shoot-view";
import { ActionForm } from "@/components/ActionForm";
import { DetailRow, Ref, StatusPill } from "@/components/shoot-bits";
import {
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { addRawAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function CrewShootPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx } = await requirePageRole("crew");
  const { locale, t } = await getT();

  const shoot = await getShoot(ctx, id);
  if (!shoot) notFound();

  const [assignments, deliverables] = await Promise.all([
    shootResources(ctx, id),
    listDeliverables(ctx, id),
  ]);

  const callTime =
    shoot.startsAt && shoot.setupMinutes
      ? new Date(shoot.startsAt.getTime() - shoot.setupMinutes * 60_000)
      : shoot.startsAt;

  return (
    <div className="hue-stagger">
      <PageHeader
        eyebrow={shoot.clientName}
        title={shoot.title}
        subtitle={whenLine(shoot, locale)}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={shoot.status} label={t.shootStatus[shoot.status]} />
            <LinkButton href={`/api/shoots/${shoot.id}/callsheet`} variant="secondary">
              {t.shoot.callSheet}
            </LinkButton>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <h2 className="mb-4 font-display text-base font-semibold">{t.shoot.callSheet}</h2>
          <DetailRow label={t.shoot.ref}>
            <Ref value={shoot.ref} />
          </DetailRow>
          {/* The call is the shoot start minus setup - worked out here rather
              than left for someone to do in their head on the morning. */}
          {callTime ? (
            <DetailRow label={locale === "ar" ? "نداء الفريق" : "Crew call"}>
              {whenLine({ ...shoot, startsAt: callTime, endsAt: null }, locale)}
            </DetailRow>
          ) : null}
          <DetailRow label={t.shoot.scheduled}>{whenLine(shoot, locale)}</DetailRow>
          <DetailRow label={t.shoot.setupMinutes}>{setupLine(shoot, locale)}</DetailRow>
          <DetailRow label={t.shoot.location}>{locationLine(shoot, locale)}</DetailRow>
          {shoot.mapUrl ? (
            <DetailRow label={t.shoot.mapUrl}>
              <a
                href={shoot.mapUrl}
                target="_blank"
                rel="noreferrer"
                className="ltr break-all text-brand hover:underline"
              >
                {shoot.mapUrl}
              </a>
            </DetailRow>
          ) : null}
          <DetailRow label={t.shoot.crew}>{crewLine(assignments, locale)}</DetailRow>
          <DetailRow label={t.resourceKind.equipment}>{kitLine(assignments, locale)}</DetailRow>
          {shoot.cameraCount ? (
            <DetailRow label={t.shoot.cameraCount}>{shoot.cameraCount}</DetailRow>
          ) : null}
          {shoot.reelsRequired ? (
            <DetailRow label={t.shoot.reelsRequired}>{shoot.reelsRequired}</DetailRow>
          ) : null}
          {shoot.photosRequired ? (
            <DetailRow label={t.shoot.photosRequired}>{shoot.photosRequired}</DetailRow>
          ) : null}
          {shoot.products ? (
            <DetailRow label={t.shoot.products}>{shoot.products}</DetailRow>
          ) : null}
          {shoot.moodboardUrl ? (
            <DetailRow label={t.shoot.moodboard}>
              <a
                href={shoot.moodboardUrl}
                target="_blank"
                rel="noreferrer"
                className="ltr break-all text-brand hover:underline"
              >
                {shoot.moodboardUrl}
              </a>
            </DetailRow>
          ) : null}
          {shoot.notes ? <DetailRow label={t.common.notes}>{shoot.notes}</DetailRow> : null}
        </Card>

        <Card className="p-0">
          <CardHeader title={t.deliverable.many} count={deliverables.length} />
          {deliverables.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t.deliverable.none} body={t.deliverable.urlHint} />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {deliverables.map((item) => (
                <div key={item.id} className="px-5 py-4">
                  <p className="text-sm font-medium">
                    {t.deliverable[item.kind]}
                    {item.label ? ` · ${item.label}` : null}
                  </p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ltr mt-0.5 block truncate text-xs text-brand hover:underline"
                  >
                    {item.url}
                  </a>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border px-5 py-5">
            <h3 className="mb-3 text-sm font-medium">{t.deliverable.raw}</h3>
            <ActionForm
              action={addRawAction}
              submitLabel={t.deliverable.add}
              loadingLabel={t.common.saving}
              hidden={{ shootId: shoot.id }}
              resetOnSuccess
            >
              <Field label={t.deliverable.url} hint={t.deliverable.urlHint}>
                <Input name="url" type="url" required dir="ltr" placeholder="https://" />
              </Field>
              <Field label={t.deliverable.label}>
                <Input name="label" />
              </Field>
            </ActionForm>
          </div>
        </Card>
      </div>
    </div>
  );
}
