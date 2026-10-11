import type { ExerciseType } from "@/schema/types";

/**
 * The wording each exercise type is presented with.
 *
 * It lives in its own module, free of server-only imports, because the
 * create/edit form is a client component and needs the labels: importing them
 * from `lib/exercises.ts` would pull that module's `node:crypto` into the
 * browser bundle.
 */
export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  weight_reps: "Weight × Reps",
  bodyweight_reps: "Bodyweight × Reps",
  bodyweight_weighted: "Weighted Bodyweight",
  bodyweight_assisted: "Assisted Bodyweight",
  reps_only: "Reps",
  duration: "Duration",
  weight_duration: "Weight × Duration",
  distance_duration: "Distance × Duration",
  short_distance_weight: "Short Distance × Weight",
  floors_duration: "Floors × Duration",
  steps_duration: "Steps × Duration",
};
