import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

/**
 * Covers unmatched URLs and any `notFound()` raised outside the protected shell.
 * Rendered inside the root layout, so it carries no navigation.
 */
export default async function NotFound() {
  const { t } = await getI18n();

  return (
    <main className="mx-auto max-w-2xl px-4 py-20">
      <h1 className="text-2xl font-semibold">{t("errors.notFound.title")}</h1>
      <p className="mt-2 text-sm text-zinc-600">{t("errors.root.notFound.body")}</p>

      <Link
        href="/"
        className="mt-6 inline-flex h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
      >
        {t("errors.notFound.back")}
      </Link>
    </main>
  );
}
