import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { I18nProvider } from "@/lib/i18n/context";
import { getI18n, htmlLang } from "@/lib/i18n/server";

/**
 * The language for the document is resolved here, on the server, from the
 * reader's stored choice: `lang`, the metadata and every server-rendered string
 * below must agree on the first byte, or a Chinese reader sees an English page
 * that translates itself after hydration.
 *
 * Reading a request header makes this layout dynamic, and therefore the whole
 * tree with it. That is the accepted cost of a correct first paint; the only
 * routes it changes are the static auth/PWA ones.
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
  themeColor: "#18181b",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, messages } = await getI18n();

  return (
    <html lang={htmlLang(locale)}>
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <I18nProvider locale={locale} messages={messages}>
          {children}
        </I18nProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
