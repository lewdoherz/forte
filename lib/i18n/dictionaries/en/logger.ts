/**
 * Messages for the "logger" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 */
export const logger = {
  /* The sticky header: navigation, the live session metrics and the finish
     action. */
  "logger.nav.back": "Back to {label}",
  "logger.metric.duration": "Duration",
  "logger.metric.volume": "Volume",
  "logger.metric.sets": "Sets",
  "logger.summary.completed": "Completed · {duration}",
  "logger.finish.action": "Finish",
  "logger.finish.finishing": "Finishing…",

  /* The quiet status line under the metrics. The store's pending marker decides
     which of the three states is shown, not the renderer. */
  "logger.sync.saved": "All changes saved",
  "logger.sync.pending": "Unsynced changes · kept on this device",
  "logger.sync.offline": "Offline · changes kept on this device",

  /* Failure copy surfaced above the exercise list. `{message}` is the server's
     own reason, which is why the wording is split into a prefix and a suffix. */
  "logger.sync.unreachable":
    "Could not reach the server. Your changes are kept on this device.",
  "logger.sync.keptSuffix": "{message} Your changes are kept on this device.",
  "logger.sync.permanentSuffix":
    "{message} Your changes are kept on this device, but syncing will not be retried.",
  "logger.sync.storageUnavailable":
    "Offline storage is unavailable. Changes on this screen may not survive a reload.",

  /* Set type names, shown on every set row. */
  "logger.setType.warmup": "Warm-up",
  "logger.setType.normal": "Normal",
  "logger.setType.failure": "Failure",
  "logger.setType.dropset": "Drop set",

  /* Set row controls and labels. */
  "logger.set.previous": "Previous",
  "logger.set.add": "Add set",
  "logger.set.undoLabel": "Undo set completion",
  "logger.set.removeLabel": "Remove set",

  /* Exercise cards, the picker and its empty states. */
  "logger.exercise.add": "Add exercise",
  "logger.exercise.removeLabel": "Remove {title}",
  "logger.exercise.rest": "Rest {duration}",
  "logger.exercise.removeTitle": "Remove exercise",
  "logger.exercise.removeConfirm": "Remove {title}? {tail}",
  "logger.exercise.removeSets":
    "Its {count} set will be removed too.|Its {count} sets will be removed too.",
  "logger.exercise.emptyActive": "No exercises yet. Add one to start logging sets.",
  "logger.exercise.emptyCompleted": "No exercises were performed in this workout.",

  "logger.superset.title": "Superset",
  "logger.superset.hint": "Alternate between these, then rest",

  /* The finish confirmation. The first line agrees with the total set count and
     the second with the number of sets still open, so the two are separate
     keys. */
  "logger.finish.title": "Finish workout",
  "logger.finish.keep": "Keep logging",
  "logger.finish.openSets":
    "{incomplete} of {count} set is not completed. {tail}|{incomplete} of {count} sets are not completed. {tail}",
  "logger.finish.openTail":
    "It will be saved as not completed — nothing is marked done for you.|They will be saved as not completed — nothing is marked done for you.",

  /* The discard confirmation. */
  "logger.discard.action": "Discard",
  "logger.discard.title": "Discard workout",
  "logger.discard.confirming": "Discarding…",
  "logger.discard.body":
    "This deletes the workout without saving a completed one. This cannot be undone.",
} as const;
