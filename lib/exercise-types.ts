import type { ExerciseType } from "@/schema/types";
import { getMessages, translate, type Locale, type MessageKey } from "./i18n";

/**
 * The wording each exercise type is presented with.
 *
 * It lives in its own module, free of server-only imports, because the
 * create/edit form is a client component and needs the labels: importing them
 * from `lib/exercises.ts` would pull that module's `node:crypto` into the
 * browser bundle.
 *
 * The wording itself belongs to the dictionary (`metrics` area) and is
 * resolved per locale here, so the form's picker and the exercise page can
 * never disagree about what a type is called.
 */
const EXERCISE_TYPE_KEYS: Record<ExerciseType, MessageKey> = {
  weight_reps: "metrics.exerciseType.weight_reps",
  bodyweight_reps: "metrics.exerciseType.bodyweight_reps",
  bodyweight_weighted: "metrics.exerciseType.bodyweight_weighted",
  bodyweight_assisted: "metrics.exerciseType.bodyweight_assisted",
  reps_only: "metrics.exerciseType.reps_only",
  duration: "metrics.exerciseType.duration",
  weight_duration: "metrics.exerciseType.weight_duration",
  distance_duration: "metrics.exerciseType.distance_duration",
  short_distance_weight: "metrics.exerciseType.short_distance_weight",
  floors_duration: "metrics.exerciseType.floors_duration",
  steps_duration: "metrics.exerciseType.steps_duration",
};

/** The type's name as the reader's language writes it. */
export function exerciseTypeLabel(type: ExerciseType, locale: Locale): string {
  return translate(locale, getMessages(locale), EXERCISE_TYPE_KEYS[type]);
}
