"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button, Notice } from "./ui";
import { initialState, type FormState } from "@/app/(app)/state";

function Submit({
  label,
  loading,
  variant,
}: {
  label: string;
  loading: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? loading : label}
    </Button>
  );
}

/**
 * The form shell every mutation in the app uses: the action's message is shown
 * in place, the submit button knows it is pending, and the fields clear on
 * success when they should.
 *
 * All labels arrive as props, already translated on the server - nothing in
 * here may import the dictionary, because a Server Component reading data back
 * out of a "use client" module gets a client reference instead of the value.
 */
export function ActionForm({
  action,
  submitLabel,
  loadingLabel,
  children,
  variant = "primary",
  resetOnSuccess = false,
  className = "",
  hidden,
  footer,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  loadingLabel: string;
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  /** For "add another" forms, where leaving the last entry in the box is noise. */
  resetOnSuccess?: boolean;
  className?: string;
  /** Values the action needs that the person does not type. */
  hidden?: Record<string, string>;
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      action={async (formData) => {
        await formAction(formData);
        if (resetOnSuccess) form.current?.reset();
      }}
      className={`space-y-4 ${className}`}
    >
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}

      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="ok">{state.ok}</Notice> : null}

      {children}

      <div className="flex flex-wrap items-center gap-3">
        <Submit label={submitLabel} loading={loadingLabel} variant={variant} />
        {footer}
      </div>
    </form>
  );
}

/**
 * A one-button form: no fields, just an act. Used for resending an invite,
 * retiring a resource, moving a shoot along a step.
 */
export function ActionButton({
  action,
  label,
  loadingLabel,
  hidden,
  variant = "secondary",
  confirm,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  loadingLabel: string;
  hidden?: Record<string, string>;
  variant?: "primary" | "secondary" | "danger";
  /** When set, the browser asks before the action runs. */
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className="inline-flex flex-col gap-2"
    >
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}
      <Submit label={label} loading={loadingLabel} variant={variant} />
      {state?.error ? (
        <span className="text-xs text-destructive">{state.error}</span>
      ) : null}
      {state?.ok ? <span className="text-xs text-success">{state.ok}</span> : null}
    </form>
  );
}
