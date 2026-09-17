"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Writes the locale cookie from the browser and refreshes, so the server
 * re-renders the page - including <html dir> - in the other direction.
 *
 * The cookie is deliberately not httpOnly: it carries no authority, only a
 * display preference, and letting the client set it avoids a round trip for
 * signed-out visitors on the login page.
 */
export function LocaleSwitcher({
  locale,
  cookieName,
  labels,
  persist,
}: {
  locale: "ar" | "en";
  cookieName: string;
  labels: { ar: string; en: string };
  /**
   * Given for a signed-in user: saves the choice to the account so the next
   * sign-in starts in the same language. Absent on the signed-out pages,
   * where there is no account to save it to.
   */
  persist?: (locale: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = locale === "ar" ? "en" : "ar";

  function switchTo() {
    document.cookie = `${cookieName}=${next};path=/;max-age=${365 * 86400};samesite=lax`;
    startTransition(async () => {
      await persist?.(next);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      disabled={pending}
      aria-label={labels[next]}
      className="rounded-full border border-border px-3 py-1 text-xs font-medium
                 text-muted-foreground transition hover:bg-muted disabled:opacity-50"
    >
      {labels[next]}
    </button>
  );
}
