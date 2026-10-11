/**
 * Messages for the "exerciseDetail" area: the exercise page and its tabs.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`.
 */
export const exerciseDetail = {
  /* Header: identity and catalog metadata, on every tab. */
  "exerciseDetail.badge.custom": "Custom exercise",
  "exerciseDetail.badge.library": "Library exercise",
  "exerciseDetail.field.primaryMuscle": "Primary muscle",
  "exerciseDetail.field.secondaryMuscles": "Secondary muscles",
  "exerciseDetail.field.equipment": "Equipment",
  "exerciseDetail.field.type": "Type",

  /* The tab shell. */
  "exerciseDetail.tabs.label": "Exercise sections",
  "exerciseDetail.tabs.howTo": "How to",
  "exerciseDetail.tabs.statistics": "Statistics",
  "exerciseDetail.tabs.history": "History",

  /* The How To panel. The exercise's title is data, so it is a placeholder. */
  "exerciseDetail.howTo.empty": "No instructions for {exercise} yet",
  "exerciseDetail.howTo.emptyBody": "This exercise has no demonstration clip or written steps.",
  "exerciseDetail.howTo.noWritten": "No written instructions for {exercise} yet.",

  /* The Statistics panel: empty states, summary tiles and the records list. */
  "exerciseDetail.stats.empty":
    "No workout history yet. Finish a workout containing {exercise} to see statistics here.",
  "exerciseDetail.stats.emptyRange": "No completed sets for {exercise} in {range}.",
  "exerciseDetail.stats.summary.volume": "Total volume",
  "exerciseDetail.stats.summary.reps": "Total reps",
  "exerciseDetail.stats.summary.sessions": "Sessions",
  "exerciseDetail.stats.summary.sets": "Completed sets",
  "exerciseDetail.stats.e1rmNote": "Epley, sets of 12 reps or fewer; a single is its load",
  "exerciseDetail.stats.recordsHeading": "Personal records",
  "exerciseDetail.stats.recordsAllTime": "all time",

  /* Chart titles, one per progression metric. */
  "exerciseDetail.chart.e1rm": "Best e1RM per session",
  "exerciseDetail.chart.reps": "Best reps per session",
  "exerciseDetail.chart.addedWeight": "Best added weight per session",
  "exerciseDetail.chart.assistance": "Lowest assistance per session",
  "exerciseDetail.chart.fastest": "Fastest time per session",
  "exerciseDetail.chart.duration": "Duration per session",
  "exerciseDetail.chart.longestHold": "Longest hold per session",
  "exerciseDetail.chart.weight": "Best weight per session",
  "exerciseDetail.chart.pace": "Best pace per session",
  "exerciseDetail.chart.floorsPerMinute": "Floors per minute per session",
  "exerciseDetail.chart.stepsPerMinute": "Steps per minute per session",

  /* Units the shared vocabulary has no key for. */
  "exerciseDetail.unit.metersPerSecond": "m/s",
  "exerciseDetail.unit.perMinute": "/min",
  "exerciseDetail.unit.floorsPerMinute": "floors/min",
  "exerciseDetail.unit.stepsPerMinute": "steps/min",

  /* The History panel: the session list and its row labels. */
  "exerciseDetail.history.empty": "No workouts include {exercise} yet.",
  "exerciseDetail.history.limit": "Showing the {count} most recent sessions.",
  "exerciseDetail.history.pr": "PR",
  "exerciseDetail.setType.warmup": "Warm-up",
  "exerciseDetail.setType.normal": "Normal",
  "exerciseDetail.setType.failure": "Failure",
  "exerciseDetail.setType.dropset": "Drop set",
} as const;
