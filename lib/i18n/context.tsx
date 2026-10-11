"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createTranslator, type Locale, type Messages, type Translate } from "./index";

/**
 * Client-side access to the active language.
 *
 * The dictionary is produced on the server and passed down as props: it is a
 * flat object of strings, so it crosses the server/client boundary intact and
 * the first client render already has the right language — no flash of English,
 * and no second request to fetch messages.
 *
 * There is no `setLocale` here on purpose. Changing the language writes a cookie
 * and, for a signed-in reader, a database column, so it is a server action; a
 * client-only setter would leave the two out of step and the next full page load
 * would revert the interface.
 */
export interface I18nContextValue {
  locale: Locale;
  t: Translate;
  messages: Messages;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  /**
   * Optional, as React's own providers declare it: `createElement(I18nProvider,
   * props, child)` passes the child as an argument rather than a prop, and the
   * verification suites render provider trees that way.
   */
  children?: ReactNode;
}) {
  const value = useMemo<I18nContextValue>(
    () => ({ locale, messages, t: createTranslator(locale, messages) }),
    [locale, messages],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Throws when used outside the provider. A silent fallback would render raw
 * message keys in production and hide the missing provider, which is exactly the
 * failure this would be doing the hiding for.
 */
export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return value;
}

/** Shorthand for the common case of only needing the translator. */
export function useT(): Translate {
  return useI18n().t;
}

/** The active locale tag, for `Intl` formatting in client components. */
export function useLocale(): Locale {
  return useI18n().locale;
}
