import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { I18nProvider } from "@/lib/i18n/context";
import { getI18n, htmlLang } from "@/lib/i18n/server";
import { isThemePreference, THEME_BOOTSTRAP_SCRIPT, THEME_COOKIE } from "@/lib/theme";

/**
 * The language and appearance for the document are resolved here on the server
 * from the reader's stored choices so the first byte agrees with hydrated state.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    // The product name is a brand, not copy: it is the same in both languages.
    title: t("common.appName"),
    description: t("common.meta.description"),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d1512",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [{ locale, messages }, cookieStore] = await Promise.all([getI18n(), cookies()]);
  const rawTheme = cookieStore.get(THEME_COOKIE)?.value;
  const themePreference = isThemePreference(rawTheme) ? rawTheme : "system";
  const initialDataTheme = themePreference === "light" ? "light" : "dark";

  return (
    <html
      lang={htmlLang(locale)}
      data-theme={initialDataTheme}
      data-theme-preference={themePreference}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <I18nProvider locale={locale} messages={messages}>
          {children}
        </I18nProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
