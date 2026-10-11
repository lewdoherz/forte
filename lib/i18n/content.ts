import type { Locale } from "./config";

/**
 * Picking the right language out of a database row.
 *
 * Catalog content (exercise titles and instructions, muscle groups, equipment)
 * is stored in English and, since migration 0016, in Simplified Chinese beside
 * it: `title_zh`, `how_to_zh`, `display_name_zh`. The English column stays the
 * source of truth and the fallback, so a row that has no translation — a custom
 * exercise the reader created, or a catalog entry awaiting translation — still
 * renders instead of showing an empty string.
 *
 * These helpers exist so every call site answers the same question the same way
 * rather than each inventing its own COALESCE.
 */

/** Chinese text for a Chinese reader, otherwise the English column. */
export function pickText(
  locale: Locale,
  english: string | null | undefined,
  chinese: string | null | undefined,
): string {
  if (locale === "zh-CN") {
    const translated = chinese?.trim();
    if (translated) return translated;
  }
  return english ?? "";
}

/**
 * Same choice for a nullable column, preserving null so callers that branch on
 * "has no value" keep working (the instructions block only renders when there
 * are instructions at all).
 */
export function pickNullableText(
  locale: Locale,
  english: string | null | undefined,
  chinese: string | null | undefined,
): string | null {
  if (locale === "zh-CN") {
    const translated = chinese?.trim();
    if (translated) return translated;
  }
  return english ?? null;
}

/** Both columns of a localizable text pair, as selected from the database. */
export interface LocalizedColumns {
  title?: string | null;
  title_zh?: string | null;
}

/**
 * The locale-independent half of the pair, so a caller that only needs to sort
 * or compare never has to know which language is on screen.
 */
export function canonicalTitle(row: LocalizedColumns): string {
  return row.title ?? "";
}
