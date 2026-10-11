import type { ExerciseType, Numeric, WorkoutSet } from "@/schema/types";
import { getMessages, translate, type Locale, type MessageKey } from "./i18n";
import { formatDecimal, formatNumber } from "./i18n/format";

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
 * Volume as a headline figure: whole kilograms, grouped the way the reader's
 * locale groups them. `formatNumber` owns the grouping — not `toLocaleString`,
 * whose output depends on the runtime's ambient locale, and the history card is
 * server-rendered and then hydrated, so a difference would make those two
 * disagree.
 */
export function formatVolumeKg(volumeKg: number, locale: Locale): string {
  return quantity(locale, formatNumber(locale, Math.round(volumeKg)), "common.unit.kg");
}

/**
 * A number and its unit, joined the way the locale writes them: English
 * separates the two with a space, Chinese does not. Every set field goes
 * through this, so no call site can invent its own spacing.
 */
function quantity(locale: Locale, value: string, unitKey: MessageKey): string {
  const messages = getMessages(locale);
  return translate(locale, messages, "common.quantity", {
    value,
    unit: translate(locale, messages, unitKey),
  });
}

/**
 * The same join for a unit English writes without a space. Seconds are the case
 * that matters: the set line has always read "90s" and "1500s", and a spaced
 * "90 s" would both change that and disagree with `formatDuration`.
 */
function tightQuantity(locale: Locale, value: string, unitKey: MessageKey): string {
  const messages = getMessages(locale);
  return translate(locale, messages, "common.quantityTight", {
    value,
    unit: translate(locale, messages, unitKey),
  });
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

/**
 * The recorded fields the formatter reads, as a structural minimum rather than
 * the full `WorkoutSet`: the logger's previous-performance column renders a
 * projection of a historical set (lib/previous-performance.ts) through this same
 * function, so the per-type switch exists exactly once. A `WorkoutSet`
 * satisfies it unchanged.
 */
export type FormattableSet = Pick<
  WorkoutSet,
  "weight_kg" | "reps" | "duration_seconds" | "distance_meters" | "rpe" | "metrics"
>;

function fieldText(field: SetField, set: FormattableSet, locale: Locale): string | null {
  switch (field) {
    case "weight":
      return set.weight_kg == null
        ? null
        : quantity(locale, formatDecimal(locale, Number(set.weight_kg)), "common.unit.kg");
    case "reps":
      return set.reps == null
        ? null
        : translate(locale, getMessages(locale), "common.plural.reps", { count: set.reps });
    case "duration":
      // Seconds stay seconds: the set line is a dense readout of one set, and
      // `formatDuration`'s "1m 30s" would make the columns jump. They are also
      // joined without a space in English ("90s"), which is why this is the one
      // field that uses the tight join.
      return set.duration_seconds == null
        ? null
        : tightQuantity(locale, trimNumber(set.duration_seconds), "common.unit.seconds");
    case "distance":
      // Metres are rendered ungrouped, exactly as the set line always has: a
      // distance here is a per-set figure, not a headline total.
      return set.distance_meters == null
        ? null
        : quantity(locale, trimNumber(set.distance_meters), "common.unit.m");
    case "floors": {
      const floors = set.metrics.floors;
      return typeof floors === "number"
        ? translate(locale, getMessages(locale), "metrics.plural.floors", { count: floors })
        : null;
    }
    case "steps": {
      const steps = set.metrics.steps;
      return typeof steps === "number"
        ? translate(locale, getMessages(locale), "metrics.plural.steps", { count: steps })
        : null;
    }
  }
}

/**
 * One set's recorded values, in the units the reader's locale writes (kg, reps,
 * seconds, metres, RPE). Fields the type does not use are simply absent, and a
 * type whose fields are all empty renders an em dash — the same convention the
 * logger's own set line uses.
 */
export function formatSetValues(
  set: FormattableSet,
  exerciseType: ExerciseType,
  locale: Locale,
): string {
  const parts = SET_FIELDS_BY_TYPE[exerciseType]
    .map((field) => fieldText(field, set, locale))
    .filter((text): text is string => text !== null);
  const values = parts.length > 0 ? parts.join(" × ") : "—";
  if (set.rpe == null) return values;
  const rpe = translate(locale, getMessages(locale), "metrics.rpe", { value: trimNumber(set.rpe) });
  return `${values} · ${rpe}`;
}
