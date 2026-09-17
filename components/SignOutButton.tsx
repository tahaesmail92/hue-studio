"use client";

import { useTransition } from "react";

export function SignOutButton({
  label,
  action,
}: {
  label: string;
  action: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => action())}
      className="text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
    >
      {label}
    </button>
  );
}
