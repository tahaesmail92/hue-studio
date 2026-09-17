import Link from "next/link";
import { fill } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { findInvite } from "@/lib/db/repo/invites";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { Notice } from "@/components/ui";
import { SetPasswordForm } from "../../set-password-form";
import { setPasswordAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { t } = await getT();
  const invite = await findInvite(token);

  if (!invite || invite.expired) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-xl font-bold">{t.auth.forgotTitle}</h1>
        <Notice tone="danger">{invite ? t.auth.inviteExpired : t.auth.inviteInvalid}</Notice>
        <Link href="/forgot" className="block text-center text-xs text-muted-foreground hover:text-foreground">
          {t.auth.forgotTitle}
        </Link>
      </div>
    );
  }

  return (
    <SetPasswordForm
      token={token}
      action={setPasswordAction}
      labels={{
        title: t.auth.forgotTitle,
        subtitle: t.auth.setPasswordSubtitle,
        greeting: fill("{name} — {email}", { name: invite.fullName, email: invite.email }),
        password: t.auth.newPassword,
        confirm: t.auth.confirmPassword,
        submit: t.auth.setPassword,
        loading: t.common.loading,
        hint: fill(t.auth.passwordHint, { min: MIN_PASSWORD_LENGTH }),
      }}
    />
  );
}
