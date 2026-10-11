"use client";

import { useI18n } from "@/lib/i18n/context";
import { LOCALE_NAMES, LOCALES } from "@/lib/i18n/config";
import { setLocaleAction } from "@/lib/locale-actions";

/**
 * The language picker.
 *
 * A plain `<select>` inside a form that posts to a server action, rather than a
 * client-side toggle: the language lives in a cookie (and, when signed in, on
 * the account row), so it has to be written where those are writable, and the
 * page has to re-render server-side. Submitting on change keeps it one gesture.
 *
 * Each option is labelled in its own language — someone who cannot read English
 * has to be able to find Chinese in the list.
 */
export function LanguageSwitcher({
  compact = false,
  className,
}: {
  /** A single inline control, for the signed-out pages and the phone header. */
  compact?: boolean;
  className?: string;
}) {
  const { locale, t } = useI18n();

  const select = (
    <select
      name="locale"
      // Controlled, not `defaultValue`: the action re-renders the tree with the
      // new locale, and a default value is only ever applied on mount, so the
      // control would keep showing the language the reader just left.
      value={locale}
      aria-label={t("common.language.switchLabel")}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className={
        compact
          ? "min-h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm hover:bg-zinc-100"
          : "min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
      }
    >
      {LOCALES.map((value) => (
        <option key={value} value={value}>
          {LOCALE_NAMES[value]}
        </option>
      ))}
    </select>
  );

  if (compact) {
    return (
      <form action={setLocaleAction} className={className}>
        {select}
      </form>
    );
  }

  return (
    <form action={setLocaleAction} className={className}>
      <label
        htmlFor="forte-locale"
        className="mb-1.5 block text-sm font-medium text-zinc-900"
      >
        {t("common.language.label")}
      </label>
      {/* The visible label names the field; the id joins the two. */}
      <div id="forte-locale">{select}</div>
      <p className="mt-1.5 text-sm text-zinc-600">{t("common.language.description")}</p>
    </form>
  );
}
