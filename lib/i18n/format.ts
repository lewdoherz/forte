import type { Locale } from "./config";

/**
 * Locale-aware formatting of numbers, dates and durations.
 *
 * Every function here takes the locale explicitly. Nothing reads an ambient
 * locale, because the same value must format identically on the server render
 * and after hydration — a formatter that guessed from the runtime would emit
 * one language on the server and another in the browser.
 *
 * Dates additionally require an IANA time zone: see `lib/timezone.ts` for why
 * the account's stored zone, not the server's, owns calendar output.
 */

const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** Intl tags: `en` would render US order, while the app's existing copy uses
 * day-month-year, so English keeps `en-GB` and Chinese uses its own tag. */
function intlTag(locale: Locale): string {
  return locale === "zh-CN" ? "zh-CN" : "en-GB";
}

function numberFormatter(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intlTag(locale), options);
    numberFormatters.set(key, formatter);
  }
  return formatter;
}

function dateFormatter(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlTag(locale), options);
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

/** Groups thousands the way the locale writes them: `2,763` / `2,763`. */
export function formatNumber(locale: Locale, value: number): string {
  return numberFormatter(locale, { maximumFractionDigits: 0 }).format(value);
}

/**
 * A quantity that may legitimately have one decimal place (a weight, a
 * distance). Trailing zeros are dropped, so 60 prints as "60" and 62.5 as
 * "62.5" rather than "60.0".
 */
export function formatDecimal(locale: Locale, value: number): string {
  return numberFormatter(locale, { maximumFractionDigits: 2 }).format(value);
}

/** e.g. `11 Oct 2026` / `2026年10月11日`. */
export function formatDate(locale: Locale, date: Date, timeZone: string): string {
  return dateFormatter(locale, { dateStyle: "medium", timeZone }).format(date);
}

/** e.g. `Mon` / `周一` — the dashboard's seven-day strip. */
export function formatWeekdayShort(locale: Locale, date: Date, timeZone: string): string {
  return dateFormatter(locale, { weekday: "short", timeZone }).format(date);
}

/** e.g. `5 Oct` / `10月5日` — a compact axis or row label. */
export function formatDayAndMonth(locale: Locale, date: Date, timeZone: string): string {
  return dateFormatter(locale, { day: "numeric", month: "short", timeZone }).format(date);
}

/** e.g. `11 Oct 2026, 06:59` / `2026年10月11日 06:59`. */
export function formatDateTime(locale: Locale, date: Date, timeZone: string): string {
  return dateFormatter(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

/** e.g. `06:59` / `06:59`. */
export function formatTime(locale: Locale, date: Date, timeZone: string): string {
  return dateFormatter(locale, { timeStyle: "short", timeZone }).format(date);
}

/**
 * A duration as a reader would say it.
 *
 * Chinese does not pluralize and writes units directly after the number
 * ("1小时5分", "5分30秒"), so it gets its own branch rather than a translated
 * template with stray spaces. Zero-valued components are omitted, and a
 * sub-minute duration falls back to seconds only.
 */
export function formatDuration(locale: Locale, totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (locale === "zh-CN") {
    if (h > 0) return `${h}小时${m}分`;
    if (m > 0) return `${m}分${s}秒`;
    return `${s}秒`;
  }

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** A short duration for dense rows, where `formatDuration` is too long. */
export function formatDurationCompact(locale: Locale, totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  if (locale === "zh-CN") {
    if (h > 0) return `${h}小时${m}分`;
    if (m > 0) return `${m}分${pad(s)}秒`;
    return `${s}秒`;
  }

  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/**
 * An elapsed stopwatch reading (`1:05:09` / `05:09`). Digits and colons only,
 * so it is identical in both locales but still needs a stable home.
 */
export function formatStopwatch(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
