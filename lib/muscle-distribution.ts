import type { SetType } from "@/schema/types";

/**
 * Muscle maths for a routine — and for a completed workout, which is why nothing
 * here takes a routine: an exercise is its muscle roles plus the sets actually
 * prescribed or logged.
 *
 * The reference frame ships TWO aggregations over the same exercises, and
 * conflating them is the obvious mistake:
 *
 *  - `roleWeightedMuscles` feeds the heatmap. A muscle's colour comes from its
 *    ROLE (primary 1, secondary 0.5), taken as a MAX across exercises, so
 *    repeating a muscle never deepens it. The README's decisive evidence: a
 *    muscle with 3.0 sets in the table still renders at half opacity.
 *  - `setWeightedMuscles` feeds the volume table. Each working set contributes
 *    1.0 to the exercise's primary muscle and 0.5 to every secondary, in SETS —
 *    and it keeps `cardio` / `full_body`, which have no heatmap art.
 */

/** A primary role weighs one whole "unit"; a secondary role weighs half. */
const PRIMARY_ROLE_WEIGHT = 1;
const SECONDARY_ROLE_WEIGHT = 0.5;

/**
 * One exercise's muscle roles plus its sets. Only the set type is needed: a
 * warm-up is not a working set.
 */
export interface MuscleExercise {
  primaryMuscle: string;
  secondaryMuscles: readonly string[];
  sets: readonly { setType: SetType }[];
}

/**
 * Warm-up sets are warm-ups, not working volume, and forte has no
 * `volumeIncludesWarmupSets` preference that would say otherwise. So a warm-up
 * set contributes to neither aggregation, and an exercise whose sets are ALL
 * warm-up contributes nothing at all — the reference's documented default
 * exclusion. An exercise with no sets is treated the same way.
 */
function workingSetCount(exercise: MuscleExercise): number {
  let count = 0;
  for (const set of exercise.sets) {
    if (set.setType !== "warmup") count += 1;
  }
  return count;
}

/**
 * Role-weighted weights for the heatmap: primary 1, secondary 0.5, MAX per
 * muscle. Only muscles that appear in some role are keys; intensity is
 * normalised separately by `heatmapOpacities`.
 */
export function roleWeightedMuscles(
  exercises: readonly MuscleExercise[],
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const exercise of exercises) {
    if (workingSetCount(exercise) === 0) continue;
    const primary = weights[exercise.primaryMuscle] ?? 0;
    if (PRIMARY_ROLE_WEIGHT > primary) weights[exercise.primaryMuscle] = PRIMARY_ROLE_WEIGHT;
    for (const muscle of exercise.secondaryMuscles) {
      const current = weights[muscle] ?? 0;
      if (SECONDARY_ROLE_WEIGHT > current) weights[muscle] = SECONDARY_ROLE_WEIGHT;
    }
  }
  return weights;
}

/**
 * Set-weighted volume per muscle, in sets. Includes muscles with no heatmap art
 * (`cardio`, `full_body`, `other`) because the companion table lists them too.
 */
export function setWeightedMuscles(
  exercises: readonly MuscleExercise[],
): Record<string, number> {
  const sets: Record<string, number> = {};
  for (const exercise of exercises) {
    const working = workingSetCount(exercise);
    if (working === 0) continue;
    const primary = exercise.primaryMuscle;
    sets[primary] = (sets[primary] ?? 0) + working * PRIMARY_ROLE_WEIGHT;
    for (const muscle of exercise.secondaryMuscles) {
      sets[muscle] = (sets[muscle] ?? 0) + working * SECONDARY_ROLE_WEIGHT;
    }
  }
  return sets;
}

export interface MuscleDistribution {
  /** Heatmap weights: primary 1, secondary 0.5, max per muscle. */
  roles: Record<string, number>;
  /** Table volume in sets: 1.0 to the primary, 0.5 to each secondary, per working set. */
  sets: Record<string, number>;
}

/** Both aggregations, for a caller that renders both (the Routine Summary). */
export function muscleDistribution(
  exercises: readonly MuscleExercise[],
): MuscleDistribution {
  return { roles: roleWeightedMuscles(exercises), sets: setWeightedMuscles(exercises) };
}

/**
 * Layer opacity for the heatmap: `weight / max(weight)`, the reference's exact
 * formula, so in practice 1.0 or 0.5. Non-positive weights are dropped, which is
 * what leaves uninvolved muscles unrendered. The maximum is taken over every
 * weight — including a code with no art, such as `cardio` — because the
 * reference normalises before it filters to the muscles it can draw.
 */
export function heatmapOpacities(weights: Record<string, number>): Record<string, number> {
  const values = Object.values(weights).filter((weight) => weight > 0);
  if (values.length === 0) return {};
  const max = Math.max(...values);
  const opacities: Record<string, number> = {};
  for (const [muscle, weight] of Object.entries(weights)) {
    if (weight > 0) opacities[muscle] = weight / max;
  }
  return opacities;
}
