"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, Input, Notice } from "@/components/ui";
import { initialState, type FormState } from "../state";

/** Every string arrives translated from the server - see lib/i18n/index.ts. */
export type LoginLabels = {
  title: string;
  subtitle: string;
  email: string;
  password: string;
  submit: string;
  forgot: string;
  loading: string;
};

function Submit({ label, loading }: { label: string; loading: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? loading : label}
    </Button>
  );
}

export function LoginForm({
  labels,
  action,
  showForgot,
}: {
  labels: LoginLabels;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  showForgot: boolean;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold">{labels.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <Field label={labels.email}>
        <Input
          name="email"
          type="email"
          autoComplete="username"
          required
          // Addresses are Latin even in the Arabic UI, so the field itself is
          // forced left-to-right rather than inheriting the page direction.
          dir="ltr"
          className="text-start"
        />
      </Field>

      <Field label={labels.password}>
        <Input name="password" type="password" autoComplete="current-password" required dir="ltr" />
      </Field>

      <Submit label={labels.submit} loading={labels.loading} />

      {showForgot ? (
        <p className="text-center">
          <Link href="/forgot" className="text-xs text-muted-foreground hover:text-foreground">
            {labels.forgot}
          </Link>
        </p>
      ) : null}
    </form>
  );
}
