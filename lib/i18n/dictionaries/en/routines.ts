/**
 * Messages for the "routines" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 */
export const routines = {
  "routines.create": "Create routine",
  "routines.edit": "Edit routine",

  "routines.list.empty": "No routines yet. Create one to plan your workouts.",
  "routines.list.noExercises": "No exercises yet",

  "routines.detail.back": "← Routines",
  "routines.detail.noExercises": "This routine has no exercises yet.",
  "routines.detail.startWorkout": "Start workout",
  "routines.detail.createdBy": "Created by {name}",

  "routines.superset": "Superset",
  "routines.supersetBadge": "SS",

  "routines.summary.title": "Routine summary",
  "routines.summary.cardTitle": "Summary",
  "routines.summary.open": "Open routine summary",
  "routines.summary.exercises": "Exercises",
  "routines.summary.totalSets": "Total sets",
  "routines.summary.estimatedDuration": "Estimated duration",
  "routines.summary.muscleDistribution": "Muscle distribution",
  "routines.summary.empty": "Add exercises to see which muscles the routine works.",

  "routines.editor.name": "Name",
  "routines.editor.notes": "Notes",
  "routines.editor.notesOptional": "Notes (optional)",
  "routines.editor.exercises": "Exercises",
  "routines.editor.library": "Library",
  "routines.editor.emptyLibraryHint": "Add an exercise from the Library to get started.",
  "routines.editor.unknownExercise": "Exercise",
  "routines.editor.restLabel": "Rest ({unit})",
  "routines.editor.setType": "Set type",
  "routines.editor.addSet": "+ Add set",
  "routines.editor.removeSet": "Remove set",
  "routines.editor.dragHandle": "Drag to reorder exercise",
  "routines.editor.dragTitle": "Drag to reorder",
  "routines.editor.moveUp": "Move exercise up",
  "routines.editor.moveDown": "Move exercise down",
  "routines.editor.removeExercise": "Remove exercise",
  "routines.editor.removeFromSuperset": "Remove from superset",
  "routines.editor.groupWithNext": "Superset with the next exercise",
  "routines.editor.ungroup": "Ungroup",
  "routines.editor.supersetShort": "+SS",
  "routines.editor.nameRequired": "Name is required.",

  "routines.setType.warmup": "Warm-up",
  "routines.setType.normal": "Normal",
  "routines.setType.failure": "Failure",
  "routines.setType.dropset": "Drop set",

  "routines.target.weight": "Weight in kilograms",
  "routines.target.reps": "Reps",
  "routines.target.duration": "Duration in seconds",
  "routines.target.distance": "Distance in metres",
  "routines.target.floors": "Floors",
  "routines.target.steps": "Steps",

  "routines.targetHeading.weight_reps": "Weight & reps",
  "routines.targetHeading.bodyweight_reps": "Reps",
  "routines.targetHeading.bodyweight_weighted": "Added weight & reps",
  "routines.targetHeading.bodyweight_assisted": "Assistance & reps",
  "routines.targetHeading.reps_only": "Reps",
  "routines.targetHeading.duration": "Duration",
  "routines.targetHeading.weight_duration": "Weight & duration",
  "routines.targetHeading.distance_duration": "Distance & duration",
  "routines.targetHeading.short_distance_weight": "Distance & weight",
  "routines.targetHeading.floors_duration": "Floors & duration",
  "routines.targetHeading.steps_duration": "Steps & duration",

  "routines.shared.heading": "Shared routine",
  "routines.shared.noSets": "No sets prescribed.",
  "routines.shared.setColumn": "Set",
  "routines.shared.sharedBy": "Shared by {name}",
  "routines.shared.anonymous": "a forte user",
  "routines.shared.readOnly":
    "This is a read-only view of someone else's routine. Nothing here can be edited.",

  "routines.actions": "Routine actions",
  "routines.duplicate": "Duplicate",
  "routines.duplicating": "Duplicating…",
  "routines.deleteConfirm": "Delete this routine? This cannot be undone.",

  "routines.share.copy": "Copy routine link",
  "routines.share.revoke": "Revoke share link",
  "routines.share.copied": "Public link copied to clipboard.",
  "routines.share.revoked": "Share link revoked.",
  "routines.share.copyFailed": "Could not copy the link.",
  "routines.share.createFailed": "Could not create a share link.",
  "routines.share.revokeFailed": "Could not revoke the link.",

  "routines.error.invalidInput": "Invalid input.",
  "routines.error.invalidRoutine": "Invalid routine.",
  "routines.error.notFound": "That routine no longer exists.",
  "routines.error.notAllowedModify": "You don't have permission to modify this routine.",
  "routines.error.notAllowedDelete": "You don't have permission to delete this routine.",
  "routines.error.invalidExercise": "One or more exercises are not available to you.",
  "routines.error.saveFailed": "Could not save the routine.",
  "routines.error.duplicateFailed": "Could not duplicate the routine.",
  "routines.error.deleteFailed": "Could not delete the routine.",

  /* Zod issues from the routine editor's schema (lib/routines.ts). `saveRoutine`
     returns the issue text verbatim, so these are read by the editor. */
  "routines.validation.nameRequired": "Name is required",
  "routines.validation.nameTooLong": "Name is too long",
  "routines.validation.weightInvalid": "Weight must be a non-negative number",
} as const;
