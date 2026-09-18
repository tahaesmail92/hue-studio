"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Input, Notice } from "./ui";
import { initialState, type FormState } from "@/app/(app)/state";

export type DangerLabels = {
  zone: string;
  action: string;
  irreversible: string;
  willRemove: string;
  nothingAttached: string;
  willKeep: string;
  typeToConfirm: string;
  alternative: string;
  cancel: string;
  loading: string;
};

function Submit({ label, loading, armed }: { label: string; loading: string; armed: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending || !armed}>
      {pending ? loading : label}
    </Button>
  );
}

/**
 * The one destructive control in the app, built to be hard to trigger by
 * accident: collapsed by default, and the button stays disabled until the
 * record's exact name has been typed.
 *
 * `lines` is the real count of what will go, worked out on the server. A
 * generic "are you sure?" teaches people to click through; a list saying
 * "14 shoots, 9 deliverable links" does not.
 */
export function DangerZone({
  action,
  hidden,
  name,
  lines,
  keeps = [],
  labels,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  /** Typed back by the person to arm the button. */
  name: string;
  /** What this delete destroys. */
  lines: string[];
  /** What survives it - listed separately, because burying "these stay" under
   *  a "will be removed" heading is worse than saying nothing. */
  keeps?: string[];
  labels: DangerLabels;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, formAction] = useActionState(action, initialState);

  if (!open) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.03] p-5">
        <h2 className="font-display text-base font-semibold text-destructive">{labels.zone}</h2>
        <p className="mt-1.5 text-xs text-muted-foreground">{labels.alternative}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border border-destructive/30 px-4 py-2 text-sm
                     text-destructive transition hover:bg-destructive/5"
        >
          {labels.action}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/[0.04] p-5">
      <h2 className="font-display text-base font-semibold text-destructive">{labels.zone}</h2>

      <Notice tone="danger">{labels.irreversible}</Notice>

      <div className="mt-4">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.nothingAttached}</p>
        ) : (
          <>
            <p className="mb-2 text-sm font-medium">{labels.willRemove}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {lines.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </>
        )}

        {keeps.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-success">{labels.willKeep}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {keeps.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <form action={formAction} className="mt-5 space-y-3">
        {Object.entries(hidden).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}

        {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}

        <label className="block">
          <span className="mb-1.5 block text-sm">
            {labels.typeToConfirm.replace("{name}", name)}
          </span>
          <Input
            name="confirmName"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          {/* Armed only on an exact match, so a near-miss cannot go through. */}
          <Submit label={labels.action} loading={labels.loading} armed={typed === name} />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setTyped("");
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {labels.cancel}
          </button>
        </div>
      </form>
    </div>
  );
}
