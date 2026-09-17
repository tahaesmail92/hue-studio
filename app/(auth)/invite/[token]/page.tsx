import Link from "next/link";
import { getT, fill } from "@/lib/i18n";
import { findInvite } from "@/lib/db/repo/invites";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { Notice } from "@/components/ui";
import { SetPasswordForm } from "../../set-password-form";
import { setPasswordAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { t } = await getT();
  const invite = await findInvite(token);

  // A dead link gets a plain explanation and a way back, not a stack trace.
  if (!invite || invite.expired) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-xl font-bold">{t.auth.setPassword}</h1>
        <Notice tone="danger">
          {invite ? t.auth.inviteExpired : t.auth.inviteInvalid}
        </Notice>
        <Link href="/login" className="block text-center text-xs text-muted-foreground hover:text-foreground">
          {t.auth.signIn}
        </Link>
      </div>
    );
  }

  return (
    <SetPasswordForm
      token={token}
      action={setPasswordAction}
      labels={{
        title: t.auth.welcome,
        subtitle: t.auth.setPasswordSubtitle,
        greeting: fill("{name} — {email}", {
          name: invite.fullName,
          email: invite.email,
        }),
        password: t.auth.newPassword,
        confirm: t.auth.confirmPassword,
        submit: t.auth.setPassword,
        loading: t.common.loading,
        hint: fill(t.auth.passwordHint, { min: MIN_PASSWORD_LENGTH }),
      }}
    />
  );
}
