"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, Input, Notice } from "@/components/ui";
import { initialState, type FormState } from "../state";

export type ForgotLabels = {
  title: string;
  subtitle: string;
  email: string;
  submit: string;
  loading: string;
  back: string;
};

function Submit({ label, loading }: { label: string; loading: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? loading : label}
    </Button>
  );
}

export function ForgotForm({
  labels,
  action,
}: {
  labels: ForgotLabels;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold">{labels.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="ok">{state.ok}</Notice> : null}

      <Field label={labels.email}>
        <Input name="email" type="email" autoComplete="username" required dir="ltr" className="text-start" />
      </Field>

      <Submit label={labels.submit} loading={labels.loading} />

      <p className="text-center">
        <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground">
          {labels.back}
        </Link>
      </p>
    </form>
  );
}
