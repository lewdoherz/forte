import type { ExerciseType, SetMetrics, WorkoutSet } from "@/schema/types";
import type { SetFormValues } from "@/components/set-form";
import type { PreviousPerformance } from "./previous-performance";
import type { LoggedExercise } from "./workout-sync";

export type TrainingField = "weight_kg" | "reps" | "duration_seconds" | "distance_meters" | "floors" | "steps";

export const TRAINING_FIELDS: Record<ExerciseType, readonly TrainingField[]> = {
  weight_reps: ["weight_kg", "reps"],
  bodyweight_reps: ["reps"],
  bodyweight_weighted: ["weight_kg", "reps"],
  bodyweight_assisted: ["weight_kg", "reps"],
  reps_only: ["reps"],
  duration: ["duration_seconds"],
  weight_duration: ["weight_kg", "duration_seconds"],
  distance_duration: ["distance_meters", "duration_seconds"],
  short_distance_weight: ["distance_meters", "weight_kg"],
  floors_duration: ["floors", "duration_seconds"],
  steps_duration: ["steps", "duration_seconds"],
};

export function trainingValue(set: Partial<SetFormValues>, field: TrainingField): string | number | null | undefined {
  return field === "floors" || field === "steps" ? set.metrics?.[field] : set[field];
}

export function validTrainingValue(field: TrainingField, value: unknown): boolean {
  if (value === null || value === undefined || String(value).trim() === "") return false;
  const raw = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return false;
  const number = Number(raw);
  if (!Number.isFinite(number)) return false;
  if (field === "weight_kg") return /^\d{1,4}(\.\d{1,3})?$/.test(raw) && number >= 0;
  if (!Number.isSafeInteger(number) || number <= 0) return false;
  return number <= (field === "reps" ? 100_000 : 2_147_483_647);
}

/** Suggestions never mutate a row, copy timer metadata, or cross exercise identities.
 * A deliberately cleared field stays blank even after remounting the logger. */
export function getSetSuggestion(
  exercise: LoggedExercise,
  set: WorkoutSet,
  index: number,
  previous: PreviousPerformance | undefined,
): Partial<SetFormValues> {
  const result: Partial<SetFormValues> = {};
  const blanks = Array.isArray(set.metrics.forte_blank_fields) ? set.metrics.forte_blank_fields : [];
  const current = exercise.sets
    .map((candidate, position) => ({ candidate, position }))
    .filter(({ candidate }) => candidate.id !== set.id && candidate.completed_at !== null)
    .sort((a, b) => {
      const type = Number(b.candidate.set_type === set.set_type) - Number(a.candidate.set_type === set.set_type);
      if (type) return type;
      const aBefore = a.position < index;
      const bBefore = b.position < index;
      if (aBefore !== bBefore) return aBefore ? -1 : 1;
      return aBefore ? b.position - a.position : a.position - b.position;
    })
    .map(({ candidate }) => candidate);
  const history = (previous?.sets ?? [])
    .map((candidate, position) => ({ candidate, position }))
    .sort((a, b) => {
      const aRank = a.position === index && a.candidate.set_type === set.set_type ? 0 : a.candidate.set_type === set.set_type ? 1 : a.position === index ? 2 : 3;
      const bRank = b.position === index && b.candidate.set_type === set.set_type ? 0 : b.candidate.set_type === set.set_type ? 1 : b.position === index ? 2 : 3;
      return aRank - bRank || a.position - b.position;
    })
    .map(({ candidate }) => candidate);
  const target = set.metrics.forte_target as (Partial<SetFormValues> & { rep_range_start?: number | null }) | undefined;
  const targetValues: Partial<SetFormValues> = target && typeof target === "object"
    ? { ...target, reps: target.reps ?? target.rep_range_start, metrics: target.metrics }
    : {};
  const older = [...(previous?.fallbackSets ?? [])].sort((a, b) => Number(b.set_type === set.set_type) - Number(a.set_type === set.set_type));
  const candidates: Partial<SetFormValues>[] = [targetValues, ...current, ...history, ...older];
  for (const field of TRAINING_FIELDS[exercise.template.exercise_type]) {
    if (trainingValue(set, field) != null || blanks.includes(field)) continue;
    const source = candidates.find((candidate) => validTrainingValue(field, trainingValue(candidate, field)));
    if (!source) continue;
    if (field === "floors" || field === "steps") {
      result.metrics = { ...result.metrics, [field]: source.metrics?.[field] };
    } else if (field === "weight_kg") {
      result.weight_kg = source.weight_kg;
    } else {
      result[field] = source[field];
    }
  }
  return result;
}

export interface ForteTimer {
  startedAt: string | null;
  elapsedSeconds: number;
}

export function readForteTimer(metrics: SetMetrics): ForteTimer | null {
  const value = metrics.forte_timer;
  if (!value || typeof value !== "object") return null;
  const timer = value as Partial<ForteTimer>;
  if (typeof timer.elapsedSeconds !== "number" || !Number.isFinite(timer.elapsedSeconds) || timer.elapsedSeconds < 0) return null;
  if (timer.startedAt !== null && (typeof timer.startedAt !== "string" || !Number.isFinite(Date.parse(timer.startedAt)))) return null;
  return { startedAt: timer.startedAt, elapsedSeconds: Math.floor(timer.elapsedSeconds) };
}

/** Wall-clock based so backgrounding and a recovered session do not lose time. */
export function timerElapsed(timer: ForteTimer, now = Date.now()): number {
  return timer.elapsedSeconds + (timer.startedAt === null ? 0 : Math.max(0, Math.floor((now - Date.parse(timer.startedAt)) / 1000)));
}
