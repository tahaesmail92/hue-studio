import { LOCALE_COOKIE } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * The signed-out shell: one card on a near-monochrome canvas, with the
 * coral-to-orange rule under the wordmark as the only colour on the page.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getT();

  return (
    <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="absolute top-5 flex items-center gap-2 px-4 end-0">
        <LocaleSwitcher
          locale={locale}
          cookieName={LOCALE_COOKIE}
          labels={{ ar: "العربية", en: "English" }}
        />
        <ThemeToggle labels={{ dark: t.common.themeDark, light: t.common.themeLight }} />
      </div>

      <div className="w-full max-w-sm hue-rise">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-black tracking-tight">{t.app.name}</p>
          <div className="mx-auto mt-3 h-[3px] w-14 rounded-full hue-gradient" />
          <p className="mt-4 text-sm text-muted-foreground">{t.app.tagline}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-7">{children}</div>
      </div>
    </main>
  );
}
