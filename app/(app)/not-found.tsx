import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

/**
 * Not-found boundary for the protected shell. `notFound()` in /workouts/[id],
 * /routines/[id] and /exercises/[id] lands here, so the header and bottom
 * navigation remain usable instead of dropping the user onto a bare page.
 */
export default async function AppNotFound() {
  const { t } = await getI18n();

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-xl font-semibold">{t("errors.notFound.title")}</h1>
      <p className="mt-2 text-sm text-zinc-600">{t("errors.app.notFound.body")}</p>

      <Link
        href="/"
        className="mt-6 inline-flex h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
      >
        {t("errors.notFound.back")}
      </Link>
    </main>
  );
}
