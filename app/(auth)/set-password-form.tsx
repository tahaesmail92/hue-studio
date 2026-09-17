"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, Input, Notice } from "@/components/ui";
import { initialState, type FormState } from "./state";

export type SetPasswordLabels = {
  title: string;
  subtitle: string;
  greeting: string;
  password: string;
  confirm: string;
  submit: string;
  loading: string;
  hint: string;
};

function Submit({ label, loading }: { label: string; loading: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? loading : label}
    </Button>
  );
}

/**
 * Shared by the invite and reset pages: both are "prove you hold this token,
 * then choose a password". The token travels in a hidden field so the action
 * does not have to reach for route params.
 */
export function SetPasswordForm({
  token,
  labels,
  action,
}: {
  token: string;
  labels: SetPasswordLabels;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <div>
        <h1 className="font-display text-xl font-bold">{labels.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      <p className="text-sm">{labels.greeting}</p>

      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <Field label={labels.password} hint={labels.hint}>
        <Input name="password" type="password" autoComplete="new-password" required dir="ltr" />
      </Field>

      <Field label={labels.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required dir="ltr" />
      </Field>

      <Submit label={labels.submit} loading={labels.loading} />
    </form>
  );
}
