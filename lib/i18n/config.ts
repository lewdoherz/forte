/**
 * Supported locales, in the order they are offered in the language picker.
 *
 * `zh-CN` is Simplified Chinese as used for Mandarin in mainland China. Locale
 * tags are BCP 47 so they can be handed straight to `Intl` formatters; the
 * cookie stores the same tag the dictionaries are keyed by.
 */
export const LOCALES = ["en", "zh-CN"] as const;

export type Locale = (typeof LOCALES)[number];

/** Used when no preference has been recorded and no request hint matches. */
export const DEFAULT_LOCALE: Locale = "en";

/**
 * Cookie holding the reader's chosen language. Readable by the server on the
 * first byte of a response, so a localized page never flashes the other
 * language, and writable on the signed-out pages too.
 */
export const LOCALE_COOKIE = "forte_locale";

/** One year: the preference is durable, not per-session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The language's own name, used in the picker: a reader looking for Chinese
 * should not have to recognize the word "Chinese" in English first. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Narrows any locale-ish tag to a supported one: `zh`, `zh-Hans`, `zh-CN` and
 * `zh-SG` all select Simplified Chinese. Checking the primary subtag is what
 * makes an `Accept-Language` header usable — it rarely carries an exact match.
 */
export function matchLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "") return null;
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized.startsWith("zh")) return "zh-CN";
  return null;
}

/**
 * Picks the first supported language out of an `Accept-Language` header.
 *
 * Header grammar is `tag;q=0.9, tag2`, and the browser's own order is an
 * acceptable approximation of preference for a first visit; q-values are only
 * consulted to skip an explicitly rejected language (`q=0`).
 */
export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const [tag, ...params] = part.split(";");
    const rejected = params.some((param) => param.trim().replace(/\s+/g, "") === "q=0");
    if (rejected) continue;
    const locale = matchLocale(tag);
    if (locale) return locale;
  }
  return null;
}
