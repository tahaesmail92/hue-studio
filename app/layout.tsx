import type { Metadata } from "next";
import { themeScript } from "@/lib/theme";
import { getT } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "HUE Studio",
  description: "Booking and management for HUE's media production department.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The locale decides the document direction, so it has to be read here - the
  // one place that renders <html>.
  const { locale, dir } = await getT();

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        {/* Loaded by link rather than next/font so a production build on the
            VPS never depends on reaching Google. Both faces carry Arabic and
            Latin, which is what lets one type system serve both directions. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;700;800;900&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="hue-grain antialiased">{children}</body>
    </html>
  );
}
