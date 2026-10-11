/**
 * Messages for the "errors" area: the route error boundary, both not-found
 * screens and the root fatal-error page.
 *
 * The root boundary renders outside the root layout, so it has no provider and
 * no locale; it reads the English and Chinese dictionaries side by side, which
 * is why `errors.global.*` and `errors.reference.*` are paired here rather than
 * living next to a single screen.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 */
export const errors = {
  "errors.app.title": "This page could not load",
  "errors.app.body":
    "Something went wrong while loading this page. Your saved workouts and routines are unaffected.",

  "errors.notFound.title": "Not found",
  "errors.app.notFound.body":
    "This workout, routine or exercise does not exist, or it belongs to another account.",
  "errors.root.notFound.body":
    "That page does not exist, or it is not available to your account.",
  "errors.notFound.back": "Back to dashboard",

  "errors.global.title": "Something went wrong",
  "errors.global.body":
    "forte hit an unexpected error and could not finish loading. Trying again often works.",
  "errors.global.retry": "Retry",

  /* The digest line: the label and hint wrap the monospaced reference, so they
     are two keys rather than one interpolated sentence. The hint carries its own
     leading punctuation, which differs between the two languages. */
  "errors.reference.label": "Reference",
  "errors.reference.hint": " — quote this if you report the problem.",
} as const;
