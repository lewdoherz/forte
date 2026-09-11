import type { SetType } from "@/schema/types";

/**
 * Routine size and duration estimate.
 *
 * The estimate is a planning aid, never a stored value, so every tunable number
 * lives here rather than being spread through the editor. Changing how long a
 * routine "takes" should be a one-file change.
 */

/**
 * Time performing one working set. A set is roughly 30–60 s of work across rep
 * ranges from heavy triples to 20-rep sets, and a routine stores no per-set
 * duration, so this is the midpoint of that span.
 */
export const SECONDS_PER_WORKING_SET = 45;

/**
 * Rest charged after a working set when the exercise does not prescribe one
 * (`routine_exercise.rest_seconds IS NULL`). 90 s is the reference app's default
 * rest timer, which is the number its users carry over.
 */
export const DEFAULT_REST_SECONDS = 90;

export interface SummaryExercise {
  sets: readonly { setType: SetType }[];
  /** The exercise's prescribed rest, or null when it does not set one. */
  restSeconds: number | null;
}

export interface RoutineSummary {
  /** Every exercise in the routine, including one that only holds warm-ups. */
  exerciseCount: number;
  /** Working sets only — warm-ups are not working volume. */
  totalSets: number;
  /** Sum of execution + rest over the counted working sets. */
  estimatedDurationSeconds: number;
}

/**
 * Working sets only. Warm-ups are warm-ups, not working volume, and forte has no
 * preference to include them — the same rule `lib/muscle-distribution.ts` uses,
 * so the three Summary numbers agree with the distribution table. An exercise
 * that holds only warm-up sets (or no sets) is still counted as an exercise, but
 * adds no sets and no time.
 *
 * Each working set is charged its exercise's rest, or `DEFAULT_REST_SECONDS` when
 * unset. The rest after the final set is charged too: that over-counts one rest
 * interval per routine, which keeps the rule simple and predictable, and at this
 * scale the difference is a minute at most.
 */
export function routineSummary(exercises: readonly SummaryExercise[]): RoutineSummary {
  let totalSets = 0;
  let estimatedDurationSeconds = 0;
  for (const exercise of exercises) {
    const rest = exercise.restSeconds ?? DEFAULT_REST_SECONDS;
    for (const set of exercise.sets) {
      if (set.setType === "warmup") continue;
      totalSets += 1;
      estimatedDurationSeconds += SECONDS_PER_WORKING_SET + rest;
    }
  }
  return { exerciseCount: exercises.length, totalSets, estimatedDurationSeconds };
}
