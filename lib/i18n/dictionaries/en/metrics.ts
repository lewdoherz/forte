/**
 * Messages for the "metrics" area: shared presentation vocabulary for set
 * values, exercise types, progress ranges and record metric names.
 *
 * Owned by the module that renders them (`lib/workout-stats.ts`,
 * `lib/exercise-types.ts`, `lib/progress.ts`), so the wording stays next to the
 * per-type field switch that decides which fields appear at all.
 */
export const metrics = {
  /* Exercise types, as the picker and the exercise page name them. */
  "metrics.exerciseType.weight_reps": "Weight × Reps",
  "metrics.exerciseType.bodyweight_reps": "Bodyweight × Reps",
  "metrics.exerciseType.bodyweight_weighted": "Weighted Bodyweight",
  "metrics.exerciseType.bodyweight_assisted": "Assisted Bodyweight",
  "metrics.exerciseType.reps_only": "Reps",
  "metrics.exerciseType.duration": "Duration",
  "metrics.exerciseType.weight_duration": "Weight × Duration",
  "metrics.exerciseType.distance_duration": "Distance × Duration",
  "metrics.exerciseType.short_distance_weight": "Short Distance × Weight",
  "metrics.exerciseType.floors_duration": "Floors × Duration",
  "metrics.exerciseType.steps_duration": "Steps × Duration",

  /* Progress ranges, shared by the Statistics tab and the progress picker. */
  "metrics.range.all": "All time",
  "metrics.range.30d": "Last 30 days",
  "metrics.range.90d": "Last 90 days",
  "metrics.range.1y": "Last year",

  /* The recorded fields a set can carry, one noun per field. */
  "metrics.field.weight": "Weight",
  "metrics.field.reps": "Reps",
  "metrics.field.duration": "Duration",
  "metrics.field.distance": "Distance",
  "metrics.field.rpe": "RPE",
  "metrics.field.floors": "Floors",
  "metrics.field.steps": "Steps",

  /* Counted values, where English marks the plural and Chinese does not
     (hence the same text twice in the Chinese pair). */
  "metrics.plural.floors": "{count} floor|{count} floors",
  "metrics.plural.steps": "{count} step|{count} steps",

  /* The one derived reading appended to a set's values. */
  "metrics.rpe": "RPE {value}",
} as const;
