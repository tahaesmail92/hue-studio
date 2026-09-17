import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { getShoot, shootEvents, shootResources } from "@/lib/db/repo/shoots";
import { listDeliverables } from "@/lib/db/repo/deliverables";
import { crewLine, locationLine, setupLine, timezoneLabel, whenLine } from "@/lib/shoot-view";
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
  Pill,
  Select,
} from "@/components/ui";
import { approveFinalAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PortalShootPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx } = await requirePageRole("client");
  const { locale, t } = await getT();

  // getShoot is scoped by ctx, so another client's reference is simply not
  // found here - the portal cannot be walked by guessing ids.
  const shoot = await getShoot(ctx, id);
  if (!shoot) notFound();

  const [assignments, events, deliverables] = await Promise.all([
    shootResources(ctx, id),
    shootEvents(ctx, id),
    listDeliverables(ctx, id),
  ]);

  const isConfirmed = ["confirmed", "in_progress", "completed", "delivered"].includes(
    shoot.status,
  );
  const finalCut = deliverables.find((d) => d.kind === "final");

  return (
    <div className="hue-stagger">
      <PageHeader
        eyebrow={shoot.clientName}
        title={shoot.title}
        subtitle={whenLine(shoot, locale)}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={shoot.status} label={t.shootStatus[shoot.status]} />
            {isConfirmed ? (
              <LinkButton href={`/api/shoots/${shoot.id}/confirmation`} variant="secondary">
                {t.shoot.downloadPdf}
              </LinkButton>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold">
              {isConfirmed ? t.shoot.confirmation : t.shoot.one}
            </h2>
            <DetailRow label={t.shoot.ref}>
              <Ref value={shoot.ref} />
            </DetailRow>
            <DetailRow label={t.shoot.kind}>
              {shoot.kind ? t.shootKind[shoot.kind] : t.common.none}
            </DetailRow>
            <DetailRow label={isConfirmed ? t.shoot.scheduled : t.shoot.requestedDate}>
              {whenLine(shoot, locale)}
            </DetailRow>
            {isConfirmed ? (
              <>
                <DetailRow label={t.common.time}>
                  {timezoneLabel(shoot.timezone, locale)}
                </DetailRow>
                <DetailRow label={t.shoot.setupMinutes}>{setupLine(shoot, locale)}</DetailRow>
                <DetailRow label={t.shoot.crew}>{crewLine(assignments, locale)}</DetailRow>
              </>
            ) : null}
            <DetailRow label={t.shoot.location}>{locationLine(shoot, locale)}</DetailRow>
            {shoot.products ? (
              <DetailRow label={t.shoot.products}>{shoot.products}</DetailRow>
            ) : null}
            {shoot.cancelledReason ? (
              <DetailRow label={t.common.notes}>{shoot.cancelledReason}</DetailRow>
            ) : null}
            {isConfirmed ? (
              <DetailRow label={t.shoot.publicLink}>
                <Link href={`/c/${shoot.confirmToken}`} className="ltr break-all text-brand hover:underline">
                  /c/{shoot.confirmToken}
                </Link>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {t.shoot.publicLinkHint}
                </span>
              </DetailRow>
            ) : null}
          </Card>

          <Card className="p-0">
            <CardHeader title={t.deliverable.many} count={deliverables.length} />
            {deliverables.length === 0 ? (
              <div className="p-6">
                <EmptyState title={t.deliverable.none} body={t.deliverable.waiting} />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {deliverables.map((item) => (
                  <div key={item.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-medium">{t.deliverable[item.kind]}</span>
                      {item.label ? (
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                      ) : null}
                      {item.approvedAt ? <Pill tone="ok">{t.deliverable.approved}</Pill> : null}
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ltr mt-1 block truncate text-sm text-brand hover:underline"
                    >
                      {item.url}
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Approving is what closes the loop: it records a date against
                the client's own name, so "I never got it" has an answer. */}
            {finalCut && !finalCut.approvedAt ? (
              <div className="border-t border-border px-5 py-5">
                <h3 className="mb-1 text-sm font-medium">{t.deliverable.approve}</h3>
                <p className="mb-4 text-xs text-muted-foreground">{t.deliverable.approveHint}</p>
                <ActionForm
                  action={approveFinalAction}
                  submitLabel={t.deliverable.approve}
                  loadingLabel={t.common.saving}
                  hidden={{ deliverableId: finalCut.id, shootId: shoot.id }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t.deliverable.rate}>
                      <Select name="rating" defaultValue="5">
                        {[5, 4, 3, 2, 1].map((score) => (
                          <option key={score} value={score}>
                            {"★".repeat(score)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t.deliverable.rateNote}>
                      <Input name="note" />
                    </Field>
                  </div>
                </ActionForm>
              </div>
            ) : null}
          </Card>
        </div>

        {/* The filtered timeline: what happened to the booking, not how the
            agency runs itself. */}
        <Card className="p-0">
          <CardHeader title={t.shoot.timeline} count={events.length} />
          <ol className="divide-y divide-border">
            {events.map((event) => (
              <li key={event.id} className="px-5 py-3.5">
                <p className="text-sm font-medium">{t.event[event.type]}</p>
                <p className="mt-0.5 text-xs text-muted-foreground tabular">
                  {formatDateTime(event.createdAt, locale, shoot.timezone)}
                </p>
                {event.note ? (
                  <p className="mt-1 text-sm text-muted-foreground">{event.note}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
