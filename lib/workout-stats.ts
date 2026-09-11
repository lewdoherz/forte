import type { ExerciseType, Numeric, WorkoutSet } from "@/schema/types";

/**
 * Derived workout summaries and the display formatting that goes with them.
 *
 * Separate from `lib/workouts.ts` on purpose: that module imports Kysely (and
 * therefore the server database layer), so a client component importing
 * `summarizeWorkout` from it would drag the whole server bundle into the
 * browser. `lib/workouts.ts` re-exports both names so existing callers are
 * unaffected.
 *
 * The set/exercise formatting lives here too, for the same reason: the history
 * card and the completed detail both render values derived from a workout, and
 * neither should have to reach into the database layer to do it.
 */

export interface WorkoutStats {
  exerciseCount: number;
  totalSets: number;
  completedSets: number;
  volumeKg: number;
  durationSeconds: number;
}

/**
 * The structural minimum `summarizeWorkout` reads. `WorkoutTree` satisfies it,
 * and so does the lighter projection the history list loads (see
 * `lib/workout-history.ts`), which is what lets one volume calculation serve
 * both screens.
 */
export interface SummarizableSet {
  /** Null until the set is completed; incomplete sets never count. */
  completed_at: Date | null;
  reps: number | null;
  weight_kg: Numeric | null;
}

export interface SummarizableExercise {
  sets: readonly SummarizableSet[];
}

export interface SummarizableWorkout {
  started_at: Date;
  ended_at: Date | null;
  exercises: readonly SummarizableExercise[];
}

/**
 * Lightweight summaries derived from the loaded tree. Volume is the sum of
 * weight × reps over completed sets (skipping rows with missing values); it is
 * never stored.
 */
export function summarizeWorkout(workout: SummarizableWorkout): WorkoutStats {
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

/**
 * Volume as a headline figure: whole kilograms with thousands separators. The
 * separator is inserted by hand rather than with `toLocaleString`, whose output
 * depends on the runtime's locale — the history card is server-rendered and
 * then hydrated, and a locale difference would make those two disagree.
 */
export function formatVolumeKg(volumeKg: number): string {
  return `${Math.round(volumeKg).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} kg`;
}

/**
 * Trailing zeros are noise on a recorded value ("70.00" is 70 kg), so numbers
 * are normalised through `Number` before display. A value that cannot be parsed
 * (there should be none) is passed through rather than shown as NaN.
 */
function trimNumber(value: string | number): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : String(value);
}

/**
 * Which fields a set of each exercise type can actually carry, in display
 * order. This is the type's own signature — a `distance_duration` set is
 * distance then duration, a `weight_reps` set is weight then reps — so a set is
 * never forced into a weight × reps shape it does not have.
 */
const SET_FIELDS_BY_TYPE: Record<ExerciseType, readonly SetField[]> = {
  weight_reps: ["weight", "reps"],
  bodyweight_reps: ["reps"],
  bodyweight_weighted: ["weight", "reps"],
  bodyweight_assisted: ["weight", "reps"],
  reps_only: ["reps"],
  duration: ["duration"],
  weight_duration: ["weight", "duration"],
  distance_duration: ["distance", "duration"],
  short_distance_weight: ["distance", "weight"],
  floors_duration: ["floors", "duration"],
  steps_duration: ["steps", "duration"],
};

type SetField = "weight" | "reps" | "duration" | "distance" | "floors" | "steps";

function fieldText(field: SetField, set: WorkoutSet): string | null {
  switch (field) {
    case "weight":
      return set.weight_kg == null ? null : `${trimNumber(set.weight_kg)} kg`;
    case "reps":
      return set.reps == null ? null : `${set.reps} ${set.reps === 1 ? "rep" : "reps"}`;
    case "duration":
      return set.duration_seconds == null ? null : `${set.duration_seconds}s`;
    case "distance":
      return set.distance_meters == null ? null : `${trimNumber(set.distance_meters)} m`;
    case "floors": {
      const floors = set.metrics.floors;
      return typeof floors === "number" ? `${floors} ${floors === 1 ? "floor" : "floors"}` : null;
    }
    case "steps": {
      const steps = set.metrics.steps;
      return typeof steps === "number" ? `${steps} ${steps === 1 ? "step" : "steps"}` : null;
    }
  }
}

/**
 * One set's recorded values, in the units the logger already uses (kg, reps,
 * seconds, metres, RPE). Fields the type does not use are simply absent, and a
 * type whose fields are all empty renders an em dash — the same convention the
 * logger's own set line uses.
 */
export function formatSetValues(set: WorkoutSet, exerciseType: ExerciseType): string {
  const parts = SET_FIELDS_BY_TYPE[exerciseType]
    .map((field) => fieldText(field, set))
    .filter((text): text is string => text !== null);
  const values = parts.length > 0 ? parts.join(" × ") : "—";
  return set.rpe == null ? values : `${values} · RPE ${trimNumber(set.rpe)}`;
}
