import type { MetadataRoute } from "next";
import { getI18n } from "@/lib/i18n/server";

/**
 * The web app manifest, localized from the same dictionary as the interface: the
 * installed app's name and description follow the reader's language. That makes
 * this route dynamic — a static manifest would bake one language in for everyone
 * — which the root layout already is, since it reads the same cookie.
 *
 * The product name stays a brand; only the tagline behind it is translated.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { t } = await getI18n();

  return {
    name: `${t("common.appName")} — ${t("common.brandTagline")}`,
    short_name: t("common.meta.manifestShortName"),
    description: t("common.meta.description"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#18181b",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
