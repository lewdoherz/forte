import type { DurationRecordDirection, ExerciseType, Numeric, WorkoutSet } from "@/schema/types";
import { estimateOneRepMax } from "./progress";

/**
 * Personal records, derived from completed workout history.
 *
 * A record is EXERCISE-specific and CATEGORY-specific: one set can be the
 * heaviest weight ever lifted and, separately, the best set volume ever
 * recorded, and each of those is its own record. Only a set that was actually
 * completed is a performance — routine templates never qualify, and an
 * unfinished set (the logger copies planned reps and weight onto one when a
 * workout starts) never qualifies — so extraction rejects a set with no
 * `completed_at` rather than trusting the caller to filter.
 *
 * Comparison is always against completed performances STRICTLY before the
 * workout being evaluated; a workout is never its own baseline. Only a strict
 * improvement counts: matching a previous best is not a new record, because a
 * tie is not progress. The first-ever performance establishes the baseline but
 * scores nothing, so it is returned flagged (`firstEver`) and excluded from
 * counts rather than hidden.
 *
 * This module is pure — no database, no React, no display formatting — and it
 * speaks canonical units only (kilograms, seconds, metres). A value and its
 * unit-equivalent are therefore the same performance: formatting can never
 * change whether something is a record.
 *
 * It is deliberately not the same source of truth as lib/progress.ts, and the
 * two disagree in exactly two places, documented rather than silently changed.
 * `getProgressSummary.bestEstimated1RmKg` computes Epley (`weight × (1 +
 * reps/30)`) for every rep count, while a record's estimated 1RM only counts
 * sets of at most `E1RM_MAX_REPS` reps (above that the estimate is
 * extrapolation) and treats a single as the actual load, not Epley's inflated
 * `weight × 31/30`, because a one-rep set IS a one-rep max. Changing
 * progress.ts is out of scope, so the record rule is the narrower one — and the
 * baseline query must apply both of the same guards, or a record could beat a
 * baseline it never actually beat.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Every category a record can be earned in, in the canonical order the UI
 * should render. One entry per distinct "better" rule, so two exercise types
 * that measure the same thing (a heaviest weight is a heaviest weight) share a
 * category instead of forking the comparison.
 */
export const RECORD_CATEGORIES = [
  "heaviest_weight",
  "heaviest_added_weight",
  "best_e1rm",
  "most_reps",
  "best_set_volume",
  "lowest_assistance",
  "best_duration",
  "longest_duration",
  "longest_distance",
  "best_pace",
  "most_floors",
  "best_floors_per_minute",
  "most_steps",
  "best_steps_per_minute",
] as const;

export type RecordCategory = (typeof RECORD_CATEGORIES)[number];

/**
 * The wording the UI renders for a category. It lives here so no component
 * invents its own — a record badge and a record list can never disagree.
 */
export const RECORD_CATEGORY_LABELS: Record<RecordCategory, string> = {
  heaviest_weight: "Heaviest weight",
  heaviest_added_weight: "Heaviest added weight",
  best_e1rm: "Best e1RM",
  most_reps: "Most reps",
  best_set_volume: "Best set volume",
  lowest_assistance: "Lowest assistance",
  best_duration: "Best duration",
  longest_duration: "Longest duration",
  longest_distance: "Longest distance",
  best_pace: "Best pace",
  most_floors: "Most floors",
  best_floors_per_minute: "Best floors per minute",
  most_steps: "Most steps",
  best_steps_per_minute: "Best steps per minute",
};

/**
 * Which direction is an improvement for a candidate. Fixed by the category,
 * except for a `duration` exercise, where the per-exercise
 * `duration_record_direction` decides whether a longer hold or a faster time
 * is the record — or, with `none`, that no duration record exists at all.
 */
export type RecordDirection = "higher" | "lower";

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

/**
 * The recorded fields a candidate is extracted from, as a structural minimum
 * rather than the full `WorkoutSet`, so callers can pass a projection.
 * `completed_at` is required on purpose: completion is part of the record
 * rule, not an optional filter the caller might forget.
 */
export type RecordSetValues = Pick<
  WorkoutSet,
  "completed_at" | "reps" | "weight_kg" | "duration_seconds" | "distance_meters" | "metrics"
>;

/** One measured value from one set, with the direction that improves it. */
export interface RecordCandidate {
  category: RecordCategory;
  value: number;
  direction: RecordDirection;
}

/**
 * Which categories each exercise type can earn, in the order the table lists
 * them. `weight_duration` and `short_distance_weight` intentionally appear with
 * two independent categories and no composite score — a heavier set and a
 * longer set are separate achievements even when the same set wins both.
 *
 * `bodyweight_assisted` has no reps category this milestone: the assistance is
 * the performance being measured, and fewer assisted reps is not comparable
 * across workouts.
 */
const CATEGORIES_BY_EXERCISE_TYPE: Record<ExerciseType, readonly RecordCategory[]> = {
  weight_reps: ["heaviest_weight", "best_e1rm", "most_reps", "best_set_volume"],
  bodyweight_reps: ["most_reps"],
  bodyweight_weighted: ["heaviest_added_weight", "most_reps"],
  bodyweight_assisted: ["lowest_assistance"],
  reps_only: ["most_reps"],
  duration: ["best_duration"],
  weight_duration: ["heaviest_weight", "longest_duration"],
  distance_duration: ["longest_distance", "best_pace"],
  short_distance_weight: ["heaviest_weight", "longest_distance"],
  floors_duration: ["most_floors", "best_floors_per_minute"],
  steps_duration: ["most_steps", "best_steps_per_minute"],
};

/**
 * Epley's estimate is extrapolation above this rep count, so a record never
 * scores one. It is exported so the baseline query can mirror the same cap in
 * SQL instead of guessing at it.
 */
export const E1RM_MAX_REPS = 12;

/**
 * The categories an exercise type can earn, in canonical order, with
 * `duration`'s `none` direction already applied — the same list
 * `extractSetRecordCandidates` walks, so an aggregate that mirrors the engine
 * (the exercise page's PR section) can never list a category the engine would
 * drop. It is a function rather than the raw table because `none` removes
 * `best_duration` from an otherwise identical type.
 */
export function recordCategoriesForExerciseType(
  exerciseType: ExerciseType,
  durationRecordDirection: DurationRecordDirection = "higher",
): readonly RecordCategory[] {
  return CATEGORIES_BY_EXERCISE_TYPE[exerciseType].filter(
    (category) => !(category === "best_duration" && durationRecordDirection === "none"),
  );
}

/**
 * The record rule for estimated one-rep max. It delegates to
 * `estimateOneRepMax` so the Epley formula exists once, and adds two record
 * guards: a single is the actual load (Epley would inflate it by a third of a
 * rep), and an estimate above `E1RM_MAX_REPS` reps is not computed at all.
 */
export function estimatedOneRepMaxForRecord(weightKg: number, reps: number): number | null {
  if (!(reps <= E1RM_MAX_REPS)) return null;
  if (reps === 1) return weightKg > 0 ? weightKg : null;
  return estimateOneRepMax(weightKg, reps);
}

/**
 * A driver numeric — node-postgres returns `numeric` as a string, PGlite as a
 * number — parsed once, with a missing or non-finite value treated as no
 * performance at all.
 */
function finiteNumber(value: Numeric | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The direction that improves a category for one exercise type. Exported so an
 * aggregate that mirrors the engine compares the same way it does — it is the
 * same switch `extractSetRecordCandidates` applies to each candidate.
 */
export function directionFor(
  category: RecordCategory,
  durationRecordDirection: DurationRecordDirection,
): RecordDirection {
  // Assistance is the counterweight the machine removes, so less of it is the
  // better performance.
  if (category === "lowest_assistance") return "lower";
  // A duration's stored direction shares the record direction's vocabulary;
  // `none` never reaches here because extraction drops the category first.
  if (category === "best_duration") return durationRecordDirection === "lower" ? "lower" : "higher";
  return "higher";
}

/**
 * Whether `value` beats `reference`. Strictly by construction: this is the
 * single definition of the spec's "a tie is not a record" rule, shared by the
 * per-workout collapse and the baseline comparison so the two can never drift.
 */
function isStrictlyBetter(value: number, reference: number, direction: RecordDirection): boolean {
  return direction === "higher" ? value > reference : value < reference;
}

/**
 * The category's value from one set, or null when the set does not carry a
 * meaningful measurement for it. Every guard here is a rule: zero loads,
 * non-positive reps, zero durations and zero counts are not performances, and
 * a rate or pace needs both of its inputs to exist (and never divides by zero).
 */
function candidateValue(
  category: RecordCategory,
  set: RecordSetValues,
  weight: number | null,
  floors: number | null,
  steps: number | null,
): number | null {
  const reps = set.reps;
  const seconds = set.duration_seconds;
  const meters = set.distance_meters;

  switch (category) {
    case "heaviest_weight":
    case "heaviest_added_weight":
      return weight != null && weight > 0 ? weight : null;
    case "best_e1rm":
      return estimatedOneRepMaxForRecord(weight ?? NaN, reps ?? NaN);
    case "most_reps":
      return reps != null && reps > 0 ? reps : null;
    case "best_set_volume":
      // weight × reps FOR THAT SET, never the workout's total volume.
      return weight != null && weight > 0 && reps != null && reps > 0 ? weight * reps : null;
    case "lowest_assistance":
      // Zero assistance is a legitimate best: none was needed.
      return weight != null && weight >= 0 ? weight : null;
    case "best_duration":
    case "longest_duration":
      return seconds != null && seconds > 0 ? seconds : null;
    case "longest_distance":
      return meters != null && meters > 0 ? meters : null;
    case "best_pace":
      // Distance per second, so distances are compared at their own length
      // instead of by raw duration.
      return meters != null && meters > 0 && seconds != null && seconds > 0 ? meters / seconds : null;
    case "most_floors":
      return floors != null && floors > 0 ? floors : null;
    case "best_floors_per_minute":
      return floors != null && floors > 0 && seconds != null && seconds > 0
        ? (floors * 60) / seconds
        : null;
    case "most_steps":
      return steps != null && steps > 0 ? steps : null;
    case "best_steps_per_minute":
      return steps != null && steps > 0 && seconds != null && seconds > 0
        ? (steps * 60) / seconds
        : null;
  }
}

/**
 * Every record a single set could earn, in the canonical category order. An
 * incomplete set earns nothing; a set missing a field simply has no candidate
 * for the categories that need it, so the per-type rules are one switch rather
 * than one branch per exercise type.
 *
 * `durationRecordDirection` is the exercise's stored setting; it only affects
 * `duration` exercises, and `"none"` means the exercise earns no duration
 * record at all.
 */
export function extractSetRecordCandidates(
  set: RecordSetValues,
  exerciseType: ExerciseType,
  durationRecordDirection: DurationRecordDirection = "higher",
): RecordCandidate[] {
  if (set.completed_at == null) return [];

  const weight = finiteNumber(set.weight_kg);
  const floors = finiteNumber(set.metrics.floors);
  const steps = finiteNumber(set.metrics.steps);

  const candidates: RecordCandidate[] = [];
  for (const category of CATEGORIES_BY_EXERCISE_TYPE[exerciseType]) {
    // `none` disables the duration record rather than picking a direction.
    if (category === "best_duration" && durationRecordDirection === "none") continue;
    const value = candidateValue(category, set, weight, floors, steps);
    if (value === null) continue;
    candidates.push({ category, value, direction: directionFor(category, durationRecordDirection) });
  }
  return candidates;
}

/**
 * Collapses many candidates to the best one per category, in canonical order.
 * This is what keeps a workout from advancing its own baseline set by set:
 * `80×8, 90×5, 100×3` has three heaviest-weight candidates and exactly one
 * survives here, before any comparison happens.
 */
export function bestRecordCandidates(candidates: readonly RecordCandidate[]): RecordCandidate[] {
  const best: Partial<Record<RecordCategory, RecordCandidate>> = {};
  for (const candidate of candidates) {
    const current = best[candidate.category];
    if (current === undefined || isStrictlyBetter(candidate.value, current.value, candidate.direction)) {
      best[candidate.category] = candidate;
    }
  }
  return RECORD_CATEGORIES.flatMap((category) => {
    const candidate = best[category];
    return candidate === undefined ? [] : [candidate];
  });
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * The pre-workout best per category for one exercise, as supplied by the
 * baseline query. A category absent from the map is the first-ever
 * performance; its value is never the workout's own — the caller must exclude
 * the workout being evaluated from the history.
 */
export type RecordBaseline = Partial<Record<RecordCategory, number>>;

/** The result of comparing one exercise's candidates against its baseline. */
export interface RecordOutcome {
  category: RecordCategory;
  /** The workout's value, canonical. */
  value: number;
  direction: RecordDirection;
  /** The value it beat, or null for a first-ever baseline. */
  previousValue: number | null;
  /** A first-ever result establishes the baseline but earns nothing. */
  firstEver: boolean;
}

/**
 * The records a workout earned, one outcome per (category) whose best candidate
 * strictly improved on the supplied baseline. Candidates are collapsed to their
 * best per category first, so several sets beating the baseline still yield one
 * outcome. A tie is dropped entirely.
 *
 * The baseline is one exercise's. Flatten the outcomes of every exercise in the
 * workout to count: each exercise contributes at most one outcome per category,
 * so the count is the number of distinct (exercise, category) pairs that
 * improved.
 */
export function compareRecordCandidates(
  candidates: readonly RecordCandidate[],
  baseline: RecordBaseline,
): RecordOutcome[] {
  const outcomes: RecordOutcome[] = [];
  for (const candidate of bestRecordCandidates(candidates)) {
    const previous = baseline[candidate.category];
    if (previous === undefined) {
      outcomes.push({ ...candidate, previousValue: null, firstEver: true });
      continue;
    }
    if (!isStrictlyBetter(candidate.value, previous, candidate.direction)) continue;
    outcomes.push({ ...candidate, previousValue: previous, firstEver: false });
  }
  return outcomes;
}

/**
 * The workout's records count: outcomes that actually improved on a baseline.
 * First-ever results are excluded — they establish the baseline, they do not
 * score.
 */
export function countEarnedRecords(records: readonly RecordOutcome[]): number {
  return records.reduce((count, record) => (record.firstEver ? count : count + 1), 0);
}
