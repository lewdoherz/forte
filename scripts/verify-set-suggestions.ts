import assert from "node:assert/strict";
import type { ExerciseType, WorkoutSet } from "../schema/types";
import type { LoggedExercise } from "../lib/workout-sync";
import type { PreviousPerformance, PreviousSetValues } from "../lib/previous-performance";
import { getSetSuggestion, readForteTimer, timerElapsed, TRAINING_FIELDS, validTrainingValue } from "../lib/set-suggestions";

const date = new Date("2026-01-01T00:00:00Z");
function row(id: string, values: Partial<WorkoutSet> = {}): WorkoutSet {
  return { id, workout_exercise_id: "exercise", position: 0, set_type: "normal", reps: null, weight_kg: null,
    duration_seconds: null, distance_meters: null, rpe: null, metrics: {}, completed_at: null, created_at: date, updated_at: date, ...values };
}
function exercise(type: ExerciseType, sets: WorkoutSet[]): LoggedExercise {
  return { id: "exercise", workout_id: "workout", template_id: "template", position: 0, superset_key: null,
    rest_seconds: null, notes: null, created_at: date, updated_at: date,
    template: { id: "template", slug: "exercise", title: "Exercise", primary_muscle: "test", exercise_type: type }, sets };
}
const empty = row("empty");
const old = row("old", { completed_at: date, reps: 8, weight_kg: "0", duration_seconds: 45, distance_meters: 200, metrics: { floors: 5, steps: 100, forte_timer: { startedAt: null, elapsedSeconds: 45 } } });
const recent = row("recent", { completed_at: date, reps: 12, weight_kg: "25" });
const later = row("later", { completed_at: date, reps: 20, weight_kg: "40" });
assert.deepEqual(getSetSuggestion(exercise("weight_reps", [old, recent, empty, later]), empty, 2, undefined), { weight_kg: "25", reps: 12 });
assert.deepEqual(getSetSuggestion(exercise("weight_reps", [old, empty, recent]), empty, 1, undefined), { weight_kg: "0", reps: 8 });
const warmup = row("warmup", { ...old, id: "warmup", set_type: "warmup" });
assert.equal(getSetSuggestion(exercise("weight_reps", [old, recent, warmup]), warmup, 2, undefined).weight_kg, undefined, "explicit zero is not missing");
const sameType = row("same", { ...old, id: "same", set_type: "warmup" });
const emptyWarmup = row("empty-warmup", { set_type: "warmup" });
assert.equal(getSetSuggestion(exercise("weight_reps", [sameType, recent, emptyWarmup]), emptyWarmup, 2, undefined).weight_kg, "0", "same type outranks nearest other type");
const unfinished = row("unfinished", { reps: 99, weight_kg: "99" });
assert.deepEqual(getSetSuggestion(exercise("weight_reps", [unfinished, empty]), empty, 1, undefined), {});
const history: PreviousPerformance = { performedAt: date, sets: [old, recent] };
assert.equal(getSetSuggestion(exercise("weight_reps", [empty]), empty, 1, history).reps, 12);
const target = row("target", { metrics: { forte_target: { rep_range_start: 6, rep_range_end: 10, weight_kg: "15", metrics: { floors: 3, forte_timer: "never copy" } } } });
assert.deepEqual(getSetSuggestion(exercise("weight_reps", [old, target]), target, 1, history), { weight_kg: "15", reps: 6 });
assert.deepEqual(getSetSuggestion(exercise("floors_duration", [old, target]), target, 1, history), { metrics: { floors: 3 }, duration_seconds: 45 });
const cleared = row("cleared", { metrics: { forte_blank_fields: ["reps"] } });
assert.deepEqual(getSetSuggestion(exercise("weight_reps", [old, cleared]), cleared, 1, history), { weight_kg: "0" });
const sparse: PreviousSetValues = { ...old, reps: null, weight_kg: null };
assert.equal(getSetSuggestion(exercise("weight_reps", [empty]), empty, 0, { performedAt: date, sets: [sparse], fallbackSets: [recent] }).reps, 12);
for (const type of Object.keys(TRAINING_FIELDS) as ExerciseType[]) {
  const suggestion = getSetSuggestion(exercise(type, [old, empty]), empty, 1, undefined);
  for (const key of Object.keys(suggestion)) {
    assert.ok(key === "metrics" ? TRAINING_FIELDS[type].some((field) => field === "floors" || field === "steps") : TRAINING_FIELDS[type].includes(key as never), `${type} contains only relevant fields`);
  }
  assert.ok(!suggestion.metrics?.forte_timer, "never copy another set's timer");
}
assert.equal(getSetSuggestion(exercise("bodyweight_assisted", [old, empty]), empty, 1, undefined).weight_kg, "0");
assert.equal(validTrainingValue("weight_kg", "0"), true);
assert.equal(validTrainingValue("reps", "0"), false);
assert.equal(validTrainingValue("duration_seconds", "1.5"), false);
assert.equal(validTrainingValue("distance_meters", "1"), true);
assert.equal(validTrainingValue("distance_meters", "0.5"), false, "fractional metres cannot reach the integer storage column");
assert.equal(validTrainingValue("weight_kg", "-5"), false);
assert.equal(validTrainingValue("weight_kg", "Infinity"), false);
const running = readForteTimer({ forte_timer: { startedAt: date.toISOString(), elapsedSeconds: 12 } });
assert.ok(running);
assert.equal(timerElapsed(running, date.getTime() + 5_999), 17);
assert.equal(timerElapsed(running, date.getTime() - 2_000), 12, "clock regression must not subtract recorded time");
assert.equal(timerElapsed({ startedAt: null, elapsedSeconds: 7 }, date.getTime()), 7);
assert.equal(readForteTimer({ forte_timer: { startedAt: "bad", elapsedSeconds: 0 } }), null);
assert.equal(readForteTimer({ forte_timer: { startedAt: null, elapsedSeconds: -1 } }), null);
console.log("Set suggestions and recoverable timer checks passed.");
