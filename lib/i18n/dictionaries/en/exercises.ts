/**
 * Messages for the "exercises" area: the library panel, its filter, the
 * create/edit form and the body heatmap.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 *
 * The per-`ExerciseType` labels are not here: `lib/exercise-types.ts` owns them
 * (over the `metrics` area's keys), so a persisted code and its wording stay in
 * one place.
 */
export const exercises = {
  "exercises.select.title": "Select Exercise",
  "exercises.select.description": "Click on an exercise to see statistics about it.",

  "exercises.library.title": "Library",
  "exercises.library.ariaLabel": "Exercise library",
  "exercises.library.newExercise": "+ Custom Exercise",
  "exercises.library.customBadge": "Custom",
  "exercises.library.empty": "No exercises found.",

  "exercises.picker.emptyFiltered": "No matching exercises.",
  "exercises.picker.empty": "No exercises available.",

  "exercises.filter.searchLabel": "Search Exercises",
  "exercises.filter.allEquipment": "All Equipment",
  "exercises.filter.allMuscles": "All Muscles",

  "exercises.field.image": "Add Image",
  "exercises.field.name": "Exercise Name",
  "exercises.field.type": "Exercise Type",
  "exercises.field.durationRecord": "Duration record",
  "exercises.field.equipment": "Equipment",
  "exercises.field.muscle": "Muscle",
  "exercises.field.primaryMuscle": "Primary Muscle Group",
  "exercises.field.secondaryMuscles": "Other Muscles",
  "exercises.field.howTo": "How to",

  "exercises.form.imageHint": "A link to an image of this exercise. Leave blank for none.",
  "exercises.form.durationRecordHint":
    "Which timed performance counts as a record. Only affects exercises measured by duration.",
  "exercises.form.selectEquipment": "Select equipment",
  "exercises.form.selectMuscle": "Select a muscle",

  "exercises.durationDirection.higher": "Longer is better",
  "exercises.durationDirection.lower": "Shorter is better",
  "exercises.durationDirection.none": "No duration record",

  "exercises.create.title": "Create exercise",
  "exercises.edit.title": "Edit exercise",

  "exercises.delete.confirm": "Delete this exercise? This cannot be undone.",

  /* Zod messages from `exerciseInputSchemaFor` and the server actions. They
     reach the form as `state.error`, so they belong to the area that renders
     them rather than to the module that produces them. */
  "exercises.validation.titleRequired": "Title is required",
  "exercises.validation.titleTooLong": "Title is too long",
  "exercises.validation.primaryMuscleRequired": "Primary muscle is required",
  "exercises.validation.equipmentRequired": "Equipment is required",
  "exercises.validation.secondaryMusclesTooMany": "Too many other muscles are selected",
  "exercises.validation.howToTooLong": "How to is too long",
  "exercises.validation.imageUrlTooLong": "Image URL is too long",
  "exercises.validation.imageUrlInvalid": "Image must be a valid URL",

  "exercises.error.invalidInput": "Invalid input.",
  "exercises.error.invalidExercise": "Invalid exercise.",
  "exercises.error.createFailed": "Could not create the exercise.",
  "exercises.error.updateFailed": "Could not update the exercise.",
  "exercises.error.notAuthorized": "You don't have permission to edit this exercise.",

  "exercises.heatmap.front": "Front",
  "exercises.heatmap.back": "Back",
  "exercises.heatmap.empty": "No muscle data yet.",
} as const;
