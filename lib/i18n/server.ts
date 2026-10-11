import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  localeFromAcceptLanguage,
  type Locale,
} from "./config";
import { createTranslator, getMessages, type Messages, type Translate } from "./index";

/**
 * Server-side locale resolution.
 *
 * Resolution order is: the reader's stored choice, then the browser's own
 * `Accept-Language` on a first visit. Both are request headers, so the correct
 * language is chosen before the first byte is rendered — a client-side switch
 * after hydration would show English for a frame.
 */
export interface I18n {
  locale: Locale;
  t: Translate;
  messages: Messages;
}

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const stored = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(stored)) return stored;

  const header = (await headers()).get("accept-language");
  return localeFromAcceptLanguage(header) ?? DEFAULT_LOCALE;
}

/**
 * The locale for code that runs on the server but may also be called outside a
 * request — the schema verification suites drive the data layer directly, where
 * `cookies()` has no store to read. Falling back to the default keeps those
 * calls working without a request-scoped fake.
 */
export async function getLocaleSafe(): Promise<Locale> {
  try {
    return await getLocale();
  } catch {
    return DEFAULT_LOCALE;
  }
}

export async function getI18n(): Promise<I18n> {
  const locale = await getLocale();
  const messages = getMessages(locale);
  return { locale, t: createTranslator(locale, messages), messages };
}

/** Same as `getI18n`, for callers that may run outside a request. */
export async function getI18nSafe(): Promise<I18n> {
  const locale = await getLocaleSafe();
  const messages = getMessages(locale);
  return { locale, t: createTranslator(locale, messages), messages };
}

/** The BCP 47 tag for `<html lang>`, which is the locale tag itself. */
export function htmlLang(locale: Locale): string {
  return locale;
}
