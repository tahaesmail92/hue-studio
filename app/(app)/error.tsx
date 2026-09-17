"use client";

import Link from "next/link";

/**
 * The signed-in error boundary. A ForbiddenError thrown by a repository or an
 * action reaches here rather than becoming a bare "server error" page.
 *
 * The message itself is not shown: it is written for the log, not for the
 * person, and repeating it would leak what exists to someone who may not be
 * allowed to know. The digest is, so a report can be matched to a log line.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="hue-eyebrow">HUE Studio</p>
      <h1 className="mt-3 font-display text-2xl font-bold">
        <span lang="ar">حصل خطأ</span> · Something went wrong
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        <span lang="ar">جرّب تاني، ولو الخطأ اتكرر كلّم إدارة الإنتاج.</span>
        <br />
        Try again; if it keeps happening, tell production.
      </p>

      <div className="mt-7 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <span lang="ar">إعادة المحاولة</span> · Retry
        </button>
        <Link
          href="/"
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          <span lang="ar">الرئيسية</span> · Home
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-6 text-xs text-muted-foreground">
          <span className="ltr">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}
