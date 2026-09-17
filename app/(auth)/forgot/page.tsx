import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSettings } from "@/lib/db/repo/settings";
import { ForgotForm } from "./forgot-form";
import { requestResetAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ForgotPage() {
  const settings = await getSettings();
  // The agency can turn self-serve resets off entirely; then this page is not
  // a page at all, rather than a form that always refuses.
  if (!settings.allowSelfReset) redirect("/login");

  const { t } = await getT();

  return (
    <ForgotForm
      action={requestResetAction}
      labels={{
        title: t.auth.forgotTitle,
        subtitle: t.auth.forgotSubtitle,
        email: t.common.email,
        submit: t.auth.sendResetLink,
        loading: t.common.loading,
        back: t.auth.signIn,
      }}
    />
  );
}
