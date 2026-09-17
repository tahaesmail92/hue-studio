import { LOCALE_COOKIE } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { navFor } from "@/lib/nav";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { NavLinks } from "@/components/NavLinks";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { setLocaleAction, signOutAction } from "./actions";

/**
 * The signed-in shell. Every route below it is behind `requireUser`, and each
 * section re-checks the role it needs - a layout guard alone would not stop a
 * page component from running its own query.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { locale, t } = await getT();

  const links = navFor(user.role).map((item) => ({
    href: item.href,
    label: t.nav[item.key],
  }));

  return (
    <div className="relative z-10 min-h-dvh">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-lg font-black tracking-tight">{t.app.name}</span>
            <span className="h-[3px] w-7 rounded-full hue-gradient" aria-hidden />
          </div>

          <NavLinks links={links} />

          <div className="flex items-center gap-3 ms-auto">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {user.fullName} · {t.roles[user.role]}
            </span>
            <LocaleSwitcher
              locale={locale}
              cookieName={LOCALE_COOKIE}
              labels={{ ar: "العربية", en: "English" }}
              persist={setLocaleAction}
            />
            <ThemeToggle labels={{ dark: t.common.themeDark, light: t.common.themeLight }} />
            <SignOutButton label={t.common.signOut} action={signOutAction} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
    </div>
  );
}
