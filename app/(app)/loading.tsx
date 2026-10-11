import { getI18n } from "@/lib/i18n/server";

/**
 * Loading state for the protected routes. Every page in this group is dynamic
 * (rendered per request), so navigation has a real gap to fill — without this,
 * the previous page simply sits there until the new one is ready.
 *
 * Deliberately a quiet skeleton rather than a spinner: it matches the card
 * rhythm most of these pages use.
 */
export default async function Loading() {
  const { t } = await getI18n();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("common.loading")}</span>
      <div className="h-7 w-40 rounded bg-zinc-200" aria-hidden="true" />
      <div className="mt-6 space-y-3" aria-hidden="true">
        <div className="h-14 rounded-xl bg-zinc-200/70" />
        <div className="h-14 rounded-xl bg-zinc-200/70" />
        <div className="h-14 rounded-xl bg-zinc-200/70" />
      </div>
    </main>
  );
}
