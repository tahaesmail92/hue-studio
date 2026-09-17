import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requirePageRole } from "@/lib/auth/session";
import { instantToZoned } from "@/lib/time";
import { getShoot, shootEvents, shootResources } from "@/lib/db/repo/shoots";
import { bookableResources, bookingsBetween } from "@/lib/db/repo/resources";
import { listDeliverables } from "@/lib/db/repo/deliverables";
import { getSettings } from "@/lib/db/repo/settings";
import { crewLine, locationLine, setupLine, whenLine } from "@/lib/shoot-view";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { DetailRow, Ref, StatusPill } from "@/components/shoot-bits";
import {
  Card,
  CardHeader,
  Checkbox,
  Field,
  Input,
  LinkButton,
  Notice,
  PageHeader,
  Pill,
  Select,
  Textarea,
} from "@/components/ui";
import {
  addDeliverableAction,
  addNoteAction,
  confirmAction,
  rejectAction,
  removeDeliverableAction,
  rescheduleAction,
  statusAction,
  toggleDeliverableAction,
  updateDetailsAction,
} from "../actions";

export const dynamic = "force-dynamic";

/**
 * Turns the client's requested date into a sensible default for the two
 * datetime-local inputs, so the common case - "yes, that date, that time" - is
 * one click rather than two pieces of typing.
 */
function defaultSlot(
  requestedDate: string | null,
  requestedTime: string | null,
  durationMinutes: number,
): { start: string; end: string } {
  const day = requestedDate ?? new Date().toISOString().slice(0, 10);
  const time = (requestedTime ?? "10:00").slice(0, 5);
  const start = `${day}T${time}`;

  const [hours, minutes] = time.split(":").map(Number);
  const endMinutes = hours * 60 + minutes + durationMinutes;
  const endTime = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

  return { start, end: `${day}T${endTime}` };
}

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requirePageRole("admin", "producer");
  const { locale, t } = await getT();

  const shoot = await getShoot(ctx, id);
  if (!shoot) notFound();

  const [assignments, events, deliverables, resources, settings] = await Promise.all([
    shootResources(ctx, id),
    shootEvents(ctx, id),
    listDeliverables(ctx, id),
    bookableResources(ctx),
    getSettings(),
  ]);

  const slot = shoot.startsAt
    ? {
        start: instantToZoned(shoot.startsAt, shoot.timezone),
        end: instantToZoned(shoot.endsAt, shoot.timezone),
      }
    : defaultSlot(shoot.requestedDate, shoot.requestedTime, settings.defaultDurationMinutes);

  // What is already booked on the day being considered. No client-side clash
  // checker: showing the day is more useful than a warning that appears after
  // the fact, and the database refuses a real clash regardless.
  const dayStart = new Date(`${slot.start.slice(0, 10)}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const dayBookings = (await bookingsBetween(ctx, dayStart, dayEnd)).filter(
    (booking) => booking.shootId !== shoot.id,
  );

  const assigned = new Set(assignments.map((a) => a.resourceId));
  const isPending = shoot.status === "pending";
  const isLive = ["confirmed", "in_progress", "completed", "delivered"].includes(shoot.status);

  return (
    <div className="hue-stagger">
      <PageHeader
        eyebrow={shoot.clientName}
        title={shoot.title}
        subtitle={whenLine(shoot, locale)}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={shoot.status} label={t.shootStatus[shoot.status]} />
            {isLive ? (
              <>
                <LinkButton href={`/api/shoots/${shoot.id}/confirmation`} variant="secondary">
                  {t.shoot.confirmation}
                </LinkButton>
                <LinkButton href={`/api/shoots/${shoot.id}/callsheet`} variant="secondary">
                  {t.shoot.callSheet}
                </LinkButton>
              </>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* What the client asked for, kept verbatim even after rescheduling. */}
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold">{t.shoot.one}</h2>
            <DetailRow label={t.shoot.ref}>
              <Ref value={shoot.ref} />
            </DetailRow>
            <DetailRow label={t.shoot.client}>{shoot.clientName}</DetailRow>
            <DetailRow label={t.shoot.kind}>
              {shoot.kind ? t.shootKind[shoot.kind] : t.common.none}
            </DetailRow>
            <DetailRow label={t.shoot.requestedDate}>
              {shoot.requestedDate ?? t.common.none}
              {shoot.requestedTime ? ` · ${shoot.requestedTime.slice(0, 5)}` : null}
            </DetailRow>
            {shoot.startsAt ? (
              <>
                <DetailRow label={t.shoot.scheduled}>{whenLine(shoot, locale)}</DetailRow>
                <DetailRow label={t.shoot.setupMinutes}>{setupLine(shoot, locale)}</DetailRow>
              </>
            ) : null}
            <DetailRow label={t.shoot.location}>{locationLine(shoot, locale)}</DetailRow>
            <DetailRow label={t.shoot.crew}>{crewLine(assignments, locale)}</DetailRow>
            {shoot.parentRef ? (
              <DetailRow label={t.shoot.reshootOf}>
                <Ref value={shoot.parentRef} />
                {shoot.reshootReason ? ` — ${shoot.reshootReason}` : null}
              </DetailRow>
            ) : null}
            {shoot.requestedNotes ? (
              <DetailRow label={t.shoot.requestedNotes}>{shoot.requestedNotes}</DetailRow>
            ) : null}
            {isLive ? (
              <DetailRow label={t.shoot.publicLink}>
                <Link
                  href={`/c/${shoot.confirmToken}`}
                  className="ltr break-all text-brand hover:underline"
                >
                  /c/{shoot.confirmToken}
                </Link>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {t.shoot.publicLinkHint}
                </span>
              </DetailRow>
            ) : null}
          </Card>

          {/* Approval: the one screen the whole spec is built around. */}
          {isPending || isLive ? (
            <Card>
              <h2 className="mb-1 font-display text-base font-semibold">
                {isPending ? t.shoot.approve : t.shoot.reschedule}
              </h2>
              <p className="mb-5 text-xs text-muted-foreground">
                {t.conflict.pickAnother}
              </p>

              {dayBookings.length > 0 ? (
                <div className="mb-5">
                  <Notice tone="warn">
                    <p className="mb-2 font-medium">{t.calendar.dayView}</p>
                    <ul className="space-y-1">
                      {dayBookings.map((booking) => (
                        <li key={`${booking.resourceId}-${booking.shootId}`} className="text-xs">
                          {booking.resourceName} · {booking.shootTitle} ·{" "}
                          <span className="tabular">
                            {formatDateTime(booking.startsAt, locale, shoot.timezone)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Notice>
                </div>
              ) : null}

              <ActionForm
                action={isPending ? confirmAction : rescheduleAction}
                submitLabel={isPending ? t.shoot.approve : t.shoot.reschedule}
                loadingLabel={t.common.saving}
                hidden={{ id: shoot.id }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t.shoot.startsAt}>
                    <Input
                      name="startsAt"
                      type="datetime-local"
                      defaultValue={slot.start}
                      required
                      dir="ltr"
                    />
                  </Field>
                  <Field label={t.shoot.endsAt}>
                    <Input
                      name="endsAt"
                      type="datetime-local"
                      defaultValue={slot.end}
                      required
                      dir="ltr"
                    />
                  </Field>
                </div>

                {isPending ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t.shoot.setupMinutes}>
                        <Input
                          name="setupMinutes"
                          type="number"
                          min={0}
                          defaultValue={settings.defaultSetupMinutes}
                        />
                      </Field>
                      <Field label={t.shoot.teardownMinutes}>
                        <Input
                          name="teardownMinutes"
                          type="number"
                          min={0}
                          defaultValue={settings.defaultTeardownMinutes}
                        />
                      </Field>
                    </div>

                    <Field label={t.shoot.location}>
                      <Select name="locationKind" defaultValue={shoot.locationKind ?? "studio"}>
                        <option value="studio">{t.locationKind.studio}</option>
                        <option value="on_location">{t.locationKind.on_location}</option>
                      </Select>
                    </Field>
                    <Field label={t.shoot.address}>
                      <Input name="address" defaultValue={shoot.address ?? ""} />
                    </Field>
                    <Field label={t.shoot.mapUrl}>
                      <Input name="mapUrl" defaultValue={shoot.mapUrl ?? ""} dir="ltr" />
                    </Field>

                    <Field label={t.shoot.resources} hint={t.resource.hint}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {resources.map((resource) => (
                          <Checkbox
                            key={resource.id}
                            name="resourceIds"
                            value={resource.id}
                            defaultChecked={assigned.has(resource.id)}
                            label={`${resource.name}${resource.craft ? ` · ${t.craft[resource.craft]}` : ""}`}
                          />
                        ))}
                      </div>
                    </Field>
                  </>
                ) : (
                  <Field label={t.shoot.rescheduleNote}>
                    <Input name="note" />
                  </Field>
                )}
              </ActionForm>
            </Card>
          ) : null}

          {/* Handover */}
          {isLive ? (
            <Card className="p-0">
              <CardHeader title={t.deliverable.many} count={deliverables.length} />
              <div className="divide-y divide-border">
                {deliverables.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                    <div className="min-w-0 flex-1">
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

                    {item.approvedAt ? (
                      <Pill tone="ok">{t.deliverable.approved}</Pill>
                    ) : item.clientVisible ? (
                      <Pill tone="brand">{t.deliverable.visibleToClient}</Pill>
                    ) : (
                      <Pill tone="neutral">{t.deliverable.hidden}</Pill>
                    )}

                    <ActionButton
                      action={toggleDeliverableAction}
                      label={item.clientVisible ? t.deliverable.hidden : t.deliverable.visibleToClient}
                      loadingLabel={t.common.saving}
                      hidden={{
                        id: item.id,
                        shootId: shoot.id,
                        visible: String(!item.clientVisible),
                      }}
                    />
                    <ActionButton
                      action={removeDeliverableAction}
                      label={t.common.delete}
                      loadingLabel={t.common.saving}
                      variant="danger"
                      hidden={{ id: item.id, shootId: shoot.id }}
                    />
                  </div>
                ))}

                <div className="px-5 py-5">
                  <ActionForm
                    action={addDeliverableAction}
                    submitLabel={t.deliverable.add}
                    loadingLabel={t.common.saving}
                    hidden={{ shootId: shoot.id }}
                    resetOnSuccess
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t.resource.kind}>
                        <Select name="kind" defaultValue="final">
                          <option value="final">{t.deliverable.final}</option>
                          <option value="raw">{t.deliverable.raw}</option>
                        </Select>
                      </Field>
                      <Field label={t.deliverable.label}>
                        <Input name="label" />
                      </Field>
                    </div>
                    <Field label={t.deliverable.url} hint={t.deliverable.urlHint}>
                      <Input name="url" type="url" required dir="ltr" placeholder="https://" />
                    </Field>
                  </ActionForm>
                </div>
              </div>
            </Card>
          ) : null}

          {/* The audit trail - who changed what, and when. */}
          <Card className="p-0">
            <CardHeader title={t.shoot.timeline} count={events.length} />
            <ol className="divide-y divide-border">
              {events.map((event) => (
                <li key={event.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-medium">{t.event[event.type]}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      {formatDateTime(event.createdAt, locale, shoot.timezone)}
                    </span>
                    {event.actorName ? (
                      <span className="text-xs text-muted-foreground">· {event.actorName}</span>
                    ) : null}
                  </div>
                  {event.note ? (
                    <p className="mt-1 text-sm text-muted-foreground">{event.note}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          {isPending ? (
            <Card>
              <h2 className="mb-4 font-display text-base font-semibold">{t.shoot.reject}</h2>
              <ActionForm
                action={rejectAction}
                submitLabel={t.shoot.reject}
                loadingLabel={t.common.saving}
                variant="danger"
                hidden={{ id: shoot.id }}
              >
                <Field label={t.shoot.rejectReason}>
                  <Textarea name="reason" rows={3} required />
                </Field>
              </ActionForm>
            </Card>
          ) : null}

          {isLive ? (
            <Card>
              <h2 className="mb-4 font-display text-base font-semibold">{t.common.status}</h2>
              <div className="flex flex-wrap gap-2">
                {shoot.status === "confirmed" ? (
                  <ActionButton
                    action={statusAction}
                    label={t.shoot.markInProgress}
                    loadingLabel={t.common.saving}
                    hidden={{ id: shoot.id, status: "in_progress" }}
                  />
                ) : null}
                {shoot.status === "in_progress" ? (
                  <ActionButton
                    action={statusAction}
                    label={t.shoot.markCompleted}
                    loadingLabel={t.common.saving}
                    hidden={{ id: shoot.id, status: "completed" }}
                  />
                ) : null}
                <ActionButton
                  action={statusAction}
                  label={t.shoot.cancel}
                  loadingLabel={t.common.saving}
                  variant="danger"
                  confirm={t.shoot.cancelReason}
                  hidden={{ id: shoot.id, status: "cancelled" }}
                />
              </div>
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold">{t.common.edit}</h2>
            <ActionForm
              action={updateDetailsAction}
              submitLabel={t.common.save}
              loadingLabel={t.common.saving}
              hidden={{ id: shoot.id }}
            >
              <Field label={t.shoot.title}>
                <Input name="title" defaultValue={shoot.title} required />
              </Field>
              <Field label={t.shoot.kind}>
                <Select name="kind" defaultValue={shoot.kind ?? ""}>
                  <option value="">{t.common.none}</option>
                  <option value="photo">{t.shootKind.photo}</option>
                  <option value="video">{t.shootKind.video}</option>
                  <option value="both">{t.shootKind.both}</option>
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t.shoot.cameraCount}>
                  <Input name="cameraCount" type="number" min={0} defaultValue={shoot.cameraCount ?? ""} />
                </Field>
                <Field label={t.shoot.reelsRequired}>
                  <Input name="reelsRequired" type="number" min={0} defaultValue={shoot.reelsRequired ?? ""} />
                </Field>
                <Field label={t.shoot.photosRequired}>
                  <Input name="photosRequired" type="number" min={0} defaultValue={shoot.photosRequired ?? ""} />
                </Field>
              </div>
              <Field label={t.shoot.products}>
                <Textarea name="products" rows={2} defaultValue={shoot.products ?? ""} />
              </Field>
              <Field label={t.shoot.moodboard}>
                <Input name="moodboardUrl" defaultValue={shoot.moodboardUrl ?? ""} dir="ltr" />
              </Field>
              <Field label={t.common.notes}>
                <Textarea name="notes" rows={3} defaultValue={shoot.notes ?? ""} />
              </Field>
            </ActionForm>
          </Card>

          <Card>
            <h2 className="mb-1 font-display text-base font-semibold">{t.shoot.addNote}</h2>
            <p className="mb-4 text-xs text-muted-foreground">{t.shoot.noteHint}</p>
            <ActionForm
              action={addNoteAction}
              submitLabel={t.common.add}
              loadingLabel={t.common.saving}
              hidden={{ id: shoot.id }}
              resetOnSuccess
            >
              <Textarea name="note" rows={3} required />
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}
