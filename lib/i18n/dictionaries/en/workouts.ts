/**
 * Messages for the "workouts" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 */
export const workouts = {
  /* The history list, its filter and its cursors. */
  "workouts.startEmpty": "Start empty workout",
  "workouts.list.active": "Active",
  "workouts.list.history": "History",
  "workouts.list.filterLabel": "Filter by exercise",
  "workouts.list.allExercises": "All exercises",
  "workouts.list.emptyForExercise": "No workouts include {title}.",
  "workouts.list.emptyCompleted": "No completed workouts yet.",
  /* The empty list is a sentence split around a link, so each locale controls
     its own punctuation and word order. */
  "workouts.list.emptyLead": "No workouts yet. ",
  "workouts.list.emptyLink": "Start one from a routine",
  "workouts.list.emptyTail": ".",
  "workouts.history.loadError": "Could not load older workouts.",
  "workouts.history.loadOlder": "Load older workouts",
  "workouts.history.end": "That is every workout.",

  /* The history card. */
  "workouts.card.inProgress": "In progress",
  "workouts.card.seeMore": "See {count} more exercise|See {count} more exercises",

  /* Metric labels, shared by the card and the completed workout header. */
  "workouts.metric.duration": "Duration",
  "workouts.metric.volume": "Volume",
  "workouts.metric.records": "Records",

  /* The completed workout. */
  "workouts.detail.back": "Back to workouts",
  "workouts.detail.noSets": "No sets were completed in this workout.",
  "workouts.detail.summaryTitle": "Workout summary",
  "workouts.setType.warmup": "Warm-up",
  "workouts.setType.normal": "Normal",
  "workouts.setType.failure": "Failure",
  "workouts.setType.dropset": "Drop set",

  /* The muscle distribution of a completed workout. */
  "workouts.summary.muscleDistribution": "Muscle distribution",
  "workouts.summary.noSets": "No working sets to show muscles for.",

  /* The per-set entry form. */
  "workouts.setForm.repsLabel": "Reps",
  "workouts.setForm.weightLabel": "Weight in kilograms",
  "workouts.setForm.rpeLabel": "Rate of perceived exertion",
  "workouts.setForm.rpePlaceholder": "RPE",
  "workouts.setForm.errorReps": "Reps must be a whole number of zero or more.",
  "workouts.setForm.errorRpe": "RPE must be between 1 and 10.",
  "workouts.setForm.errorWeight": "Weight must be a non-negative number.",

  /* The rest countdown. `{time}` is a stopwatch reading. */
  "workouts.rest.rest": "Rest {time}",
  "workouts.rest.skip": "Skip",
  "workouts.rest.skipLabel": "Skip rest",

  /* Server-action failures the reader sees. */
  "workouts.error.notAuthorized": "You don't have permission to do that.",
  "workouts.error.finished": "This workout is already finished.",
  "workouts.error.invalidEndedAt": "That finish time is outside the workout.",
  "workouts.error.notFound": "That workout could not be found.",
  "workouts.error.discardFailed": "Could not discard this workout.",
  "workouts.error.syncFailed": "Could not sync this workout.",
  "workouts.error.invalidState": "Invalid workout state.",

  /* Zod issues from the sync document's schema (lib/workouts.ts). The sync
     action returns the issue text verbatim, so these are read by the logger. */
  "workouts.validation.weightInvalid": "Weight must be a non-negative number",
  "workouts.validation.rpeInvalid": "RPE must be between 1 and 10",
  "workouts.validation.duplicateExerciseId": "Duplicate exercise id",
  "workouts.validation.exercisePositionTaken": "Two exercises share a position",
  "workouts.validation.duplicateSetId": "Duplicate set id",
  "workouts.validation.setPositionTaken": "Two sets share a position",
} as const;
