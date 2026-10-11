"use client";

import "./globals.css";
import { errors as errorsEn } from "@/lib/i18n/dictionaries/en/errors";
import { errors as errorsZh } from "@/lib/i18n/dictionaries/zh-CN/errors";

/**
 * Root error boundary. It replaces the root layout, so it must render its own
 * <html>/<body> and import the global stylesheet itself — global styles are not
 * inherited here.
 *
 * For the same reason it renders outside `<I18nProvider>`: there is no provider
 * and no request cookie at this point, so `useI18n()` cannot be called and the
 * reader's language is unknown. Both dictionaries are read directly instead and
 * both languages are shown — the only honest choice on a page that may have
 * taken the interface language down with it. `<html lang>` therefore stays the
 * neutral "en" and each Chinese block is marked `lang="zh-CN"`.
 *
 * Only the digest is shown: forwarded server errors deliberately carry a
 * generic message in production, and internals must never reach the UI.
 *
 * `retry()` is preferred over `reset()` because it re-fetches and re-renders,
 * which is what actually helps when the cause was a transient server failure.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <main className="mx-auto max-w-2xl px-4 py-20">
          <h1 className="text-2xl font-semibold">
            {errorsEn["errors.global.title"]}
            <span className="mt-1 block text-lg font-medium text-zinc-600" lang="zh-CN">
              {errorsZh["errors.global.title"]}
            </span>
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {errorsEn["errors.global.body"]}
            <span className="mt-1 block" lang="zh-CN">
              {errorsZh["errors.global.body"]}
            </span>
          </p>

          {error.digest ? (
            <p className="mt-6 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
              {errorsEn["errors.reference.label"]}{" "}
              <span className="font-mono">{error.digest}</span>
              {errorsEn["errors.reference.hint"]}
              <span className="mt-1 block" lang="zh-CN">
                {errorsZh["errors.reference.label"]}{" "}
                <span className="font-mono">{error.digest}</span>
                {errorsZh["errors.reference.hint"]}
              </span>
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => retry()}
            className="mt-6 h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
          >
            {errorsEn["errors.global.retry"]} / {errorsZh["errors.global.retry"]}
          </button>
        </main>
      </body>
    </html>
  );
}
