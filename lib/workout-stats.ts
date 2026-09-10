import type { WorkoutTree } from "@/schema/types";

/**
 * Derived workout summaries.
 *
 * Separate from `lib/workouts.ts` on purpose: that module imports Kysely (and
 * therefore the server database layer), so a client component importing
 * `summarizeWorkout` from it would drag the whole server bundle into the
 * browser. `lib/workouts.ts` re-exports both names so existing callers are
 * unaffected.
 */

export interface WorkoutStats {
  exerciseCount: number;
  totalSets: number;
  completedSets: number;
  volumeKg: number;
  durationSeconds: number;
}

/**
 * Lightweight summaries derived from the loaded tree. Volume is the sum of
 * weight × reps over completed sets (skipping rows with missing values); it is
 * never stored.
 */
export function summarizeWorkout(workout: WorkoutTree): WorkoutStats {
  const sets = workout.exercises.flatMap((e) => e.sets);
  const volumeKg = sets.reduce((sum, s) => {
    if (s.completed_at == null || s.reps == null || s.weight_kg == null) return sum;
    return sum + Number(s.weight_kg) * s.reps;
  }, 0);
  const end = workout.ended_at ?? new Date();
  return {
    exerciseCount: workout.exercises.length,
    totalSets: sets.length,
    completedSets: sets.filter((s) => s.completed_at != null).length,
    volumeKg,
    durationSeconds: Math.max(0, Math.floor((end.getTime() - workout.started_at.getTime()) / 1000)),
  };
}
