import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { currentUser, homeFor } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/repo/settings";
import { LoginForm } from "./login-form";
import { signInAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Someone who is already signed in has no business on this page.
  const user = await currentUser();
  if (user) redirect(homeFor(user.role));

  const { t } = await getT();
  const settings = await getSettings();

  return (
    <LoginForm
      action={signInAction}
      showForgot={settings.allowSelfReset}
      labels={{
        title: t.auth.signIn,
        subtitle: t.auth.signInSubtitle,
        email: t.common.email,
        password: t.auth.password,
        submit: t.auth.signIn,
        forgot: t.auth.forgot,
        loading: t.common.loading,
      }}
    />
  );
}
