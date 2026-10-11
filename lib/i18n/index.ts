import { DEFAULT_LOCALE, type Locale } from "./config";
import { en } from "./dictionaries/en";
import { zhCN } from "./dictionaries/zh-CN";

/**
 * The translation layer shared by server components, client components and
 * server actions.
 *
 * A message is a plain string, never a function: the same dictionary object is
 * produced on the server and handed to the client provider as props, and a
 * function would not survive that boundary. Values are substituted into `{name}`
 * placeholders instead, and a `|` pair is pluralized by `Intl.PluralRules`.
 */
export type MessageKey = keyof typeof en;

/** Every locale must define every key, so no screen can fall back silently. */
export type Messages = Record<MessageKey, string>;

export const dictionaries: Record<Locale, Messages> = {
  en,
  "zh-CN": zhCN,
};

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

/** Values accepted by `{placeholder}` interpolation. */
export type MessageParams = Record<string, string | number>;

/**
 * Substitutes `{name}` placeholders. An unknown placeholder is left untouched
 * rather than replaced with "undefined", so a typo shows up in the UI instead of
 * shipping a plausible-looking wrong sentence.
 *
 * `|` selects a plural form. It is handled before interpolation because the
 * placeholder is inside each alternative, not around the whole string.
 */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Resolves a key for a locale. An absent key returns the key itself: at
 * runtime that cannot happen through the typed API, and echoing the key is
 * more diagnosable than an empty screen.
 */
export function translate(
  locale: Locale,
  messages: Messages,
  key: MessageKey,
  params?: MessageParams,
): string {
  const template: string | undefined = messages[key];
  if (template === undefined) return key;

  let chosen = template;
  if (
    params &&
    typeof params.count === "number" &&
    Number.isFinite(params.count) &&
    template.includes("|")
  ) {
    const forms = template.split("|");
    const category = pluralRules(locale).select(params.count);
    // Two forms cover both locales: English uses `one` for exactly one, and
    // Chinese has a single category, so it always lands on the last form —
    // which is why a Chinese plural pair is written with the same text twice.
    chosen = category === "one" ? forms[0] : forms[forms.length - 1];
  }

  return interpolate(chosen, params);
}

const pluralRuleCache = new Map<Locale, Intl.PluralRules>();

function pluralRules(locale: Locale): Intl.PluralRules {
  let rules = pluralRuleCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRuleCache.set(locale, rules);
  }
  return rules;
}

/** A key-bound translator, as handed to components. */
export type Translate = (key: MessageKey, params?: MessageParams) => string;

export function createTranslator(locale: Locale, messages: Messages): Translate {
  return (key, params) => translate(locale, messages, key, params);
}

export type { Locale };
export {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_NAMES,
  LOCALES,
  isLocale,
  localeFromAcceptLanguage,
  matchLocale,
} from "./config";
