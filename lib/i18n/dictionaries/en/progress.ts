/**
 * Messages for the "progress" area: the exercise picker that routes to the
 * canonical Statistics view.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 *
 * Range labels are not here: they are shared with the Statistics tab and live
 * behind `rangeLabel` in `lib/progress.ts`.
 */
export const progress = {
  "progress.intro":
    "Choose an exercise to view its statistics, progression, and personal records. Results come from completed sets in finished workouts.",
  "progress.picker.exercise": "Exercise",
  "progress.picker.placeholder": "Select an exercise…",
  "progress.picker.range": "Range",
  "progress.empty": "No exercises available.",
  "progress.footnote":
    "Exercise statistics use type-specific metrics, so a run, hold, and weighted exercise are never compared using the same generic summary.",

  /* The chart's accessible name: the caller supplies both words. */
  "progress.chart.ariaLabel": "{title} ({unit})",
} as const;
