import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="hue-eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="text-3xl font-extrabold">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-6 ${className}`}>{children}</div>
  );
}

/** Card header row with the small count badge the brand system calls for. */
export function CardHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-6 py-4">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {count === undefined ? null : (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular">
          {count}
        </span>
      )}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none " +
  "transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-60";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="flex items-center gap-2.5 text-sm">
      <input
        {...props}
        type="checkbox"
        className="size-4 rounded border-input accent-[var(--brand)]"
      />
      {label}
    </label>
  );
}

const buttonBase =
  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium " +
  "transition disabled:opacity-50";

// Primary is a coral fill, not the gradient: the gradient stays an accent,
// reserved for the mark, KPI numerals and small flourishes.
const buttonStyles = {
  primary:
    "bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_var(--brand)] hover:opacity-90",
  secondary: "border border-border bg-card hover:bg-muted",
  danger: "border border-destructive/30 text-destructive hover:bg-destructive/5",
} as const;

export function Button({
  variant = "primary",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button {...props} className={`${buttonBase} ${buttonStyles[variant]} ${props.className ?? ""}`} />
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof buttonStyles;
}) {
  return (
    <Link href={href} className={`${buttonBase} ${buttonStyles[variant]}`}>
      {children}
    </Link>
  );
}

const pillStyles = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  ok: "bg-success/10 text-success border-success/20",
  warn: "bg-warning/10 text-warning border-warning/25",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  brand: "bg-accent text-brand border-brand/20",
} as const;

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof pillStyles;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${pillStyles[tone]}`}
    >
      {children}
    </span>
  );
}

export function Notice({
  tone = "warn",
  children,
}: {
  tone?: "warn" | "danger" | "ok";
  children: ReactNode;
}) {
  const styles = {
    warn: "border-warning/30 bg-warning/5 text-warning",
    danger: "border-destructive/30 bg-destructive/5 text-destructive",
    ok: "border-success/30 bg-success/5 text-success",
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/** Big gradient numeral — the brand's KPI treatment. */
export function Stat({
  label,
  value,
  note,
  muted = false,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  muted?: boolean;
}) {
  return (
    <Card>
      <p className="hue-eyebrow">{label}</p>
      <p
        className={`mt-2 font-display text-4xl font-black tabular ${
          muted ? "text-muted-foreground" : "hue-gradient-text"
        }`}
      >
        {value}
      </p>
      {note ? <p className="mt-1.5 text-xs text-muted-foreground">{note}</p> : null}
    </Card>
  );
}
