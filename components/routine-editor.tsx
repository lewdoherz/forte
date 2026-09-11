"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExerciseType, RoutineTree, SetType } from "@/schema/types";
import { SET_TYPES } from "@/schema/types";
import { normaliseSupersetKeys } from "@/lib/supersets";
import { saveRoutine } from "@/lib/routine-actions";
import type { VocabularyEntry } from "@/components/exercise-filter-form";
import { ExercisePicker, type PickerExercise } from "@/components/exercise-picker";
import { RoutineSummaryCard } from "@/components/routine-summary-card";
import { RoutineSummaryPanel } from "@/components/routine-summary-panel";

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: "Warm-up",
  normal: "Normal",
  failure: "Failure",
  dropset: "Drop set",
};

type SetDraft = {
  set_type: SetType;
  reps: string;
  weight_kg: string;
  duration_seconds: string;
  distance_meters: string;
  // Sidecar metrics, drafted as strings like every other target. They live in
  // `metrics` on save rather than in their own columns.
  floors: string;
  steps: string;
};

/** The per-set target values, keyed the same way the draft stores them. */
type SetDraftValueKey =
  | "reps"
  | "weight_kg"
  | "duration_seconds"
  | "distance_meters"
  | "floors"
  | "steps";

/** A blank set: `normal` is what most sets are, and every target starts absent. */
function emptySet(): SetDraft {
  return {
    set_type: "normal",
    reps: "",
    weight_kg: "",
    duration_seconds: "",
    distance_meters: "",
    floors: "",
    steps: "",
  };
}

/**
 * The sidecar metrics a set carries, dropping targets the user left blank. An
 * empty object is deliberate: it is what `routine_set.metrics` defaults to, so a
 * type that uses no sidecar metric round-trips as an empty SetMetrics rather
 * than as null.
 */
function setMetricsFromDraft(s: SetDraft): { steps?: number; floors?: number } {
  const metrics: { steps?: number; floors?: number } = {};
  if (s.steps.trim() !== "") metrics.steps = Number(s.steps);
  if (s.floors.trim() !== "") metrics.floors = Number(s.floors);
  return metrics;
}

/**
 * Which targets the editor collects for each exercise type, in the order the
 * logger displays them. This mirrors the logger's own per-type signature
 * (`SET_FIELDS_BY_TYPE` in lib/workout-stats.ts) so a `distance_duration` set is
 * distance then duration and a `weight_reps` set is weight then reps — a set is
 * never forced into a weight × reps shape it does not have. Floors and steps are
 * sidecar metrics on `routine_set.metrics`, exactly as they are on the
 * completed-workout side, so every supported type now has a target.
 */
type SetTargetField = "weight" | "reps" | "duration" | "distance" | "floors" | "steps";

const TARGET_FIELDS_BY_TYPE: Record<ExerciseType, readonly SetTargetField[]> = {
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

/**
 * The form input for a target, reusing the logger's units and wording: kg,
 * reps, seconds and metres, with weight the only decimal.
 */
const TARGET_FIELD_INPUTS: Record<
  SetTargetField,
  {
    draftKey: SetDraftValueKey;
    label: string;
    placeholder: string;
    inputMode: "numeric" | "decimal";
    step?: string;
  }
> = {
  weight: {
    draftKey: "weight_kg",
    label: "Weight in kilograms",
    placeholder: "kg",
    inputMode: "decimal",
    step: "0.001",
  },
  reps: { draftKey: "reps", label: "Reps", placeholder: "reps", inputMode: "numeric" },
  duration: {
    draftKey: "duration_seconds",
    label: "Duration in seconds",
    placeholder: "s",
    inputMode: "numeric",
  },
  distance: {
    draftKey: "distance_meters",
    label: "Distance in metres",
    placeholder: "m",
    inputMode: "numeric",
  },
  floors: { draftKey: "floors", label: "Floors", placeholder: "floors", inputMode: "numeric" },
  steps: { draftKey: "steps", label: "Steps", placeholder: "steps", inputMode: "numeric" },
};

type ExerciseDraft = {
  /**
   * Stable draft-local id. React keys and the drag hit-test both need an
   * identity that survives a reorder, which the array index cannot provide —
   * an index key would remount the dragged row and drop its pointer capture.
   */
  id: string;
  template_id: string;
  superset_key: string | null;
  rest_seconds: string;
  notes: string;
  sets: SetDraft[];
};

/**
 * Grouping is recomputed after every structural change, because a superset is
 * only valid while its members are CONSECUTIVE — moving an exercise can split a
 * group, and the stored form must match what is shown. The same rule runs on
 * save, so display and persistence cannot drift.
 */
function withNormalisedGroups(next: ExerciseDraft[]): ExerciseDraft[] {
  const keys = normaliseSupersetKeys(next);
  return next.map((ex, i) => (ex.superset_key === keys[i] ? ex : { ...ex, superset_key: keys[i] }));
}

/**
 * The catalog slice the editor needs: what the picker renders, plus the muscle
 * roles the Summary reads and the exercise type that chooses the set targets.
 * `secondary_muscles` and `exercise_type` are the extras the Library panel's
 * rows never need.
 */
export interface RoutineEditorExercise extends PickerExercise {
  secondary_muscles: string[];
  exercise_type: ExerciseType;
}

interface RoutineEditorProps {
  library: RoutineEditorExercise[];
  muscles: VocabularyEntry[];
  equipment: VocabularyEntry[];
  initial?: RoutineTree;
}

/**
 * The Create/Edit screen's body, shared by both routes.
 *
 * The draft lives here — title, notes, exercises — so Create and Edit are one
 * implementation with different seeds, and the Summary can be derived from the
 * unsaved draft rather than from anything the server has stored. A routine is a
 * template, so nothing here displays completed-workout values.
 */
export function RoutineEditor({ library, muscles, equipment, initial }: RoutineEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [exercises, setExercises] = useState<ExerciseDraft[]>(() =>
    (initial?.exercises ?? []).map((e) => ({
      id: crypto.randomUUID(),
      template_id: e.template_id,
      superset_key: e.superset_key,
      rest_seconds: e.rest_seconds?.toString() ?? "",
      notes: e.notes ?? "",
      sets: e.sets.map((s) => ({
        set_type: s.set_type,
        reps: s.reps?.toString() ?? "",
        weight_kg: s.weight_kg ?? "",
        duration_seconds: s.duration_seconds?.toString() ?? "",
        distance_meters: s.distance_meters?.toString() ?? "",
        floors: s.metrics.floors?.toString() ?? "",
        steps: s.metrics.steps?.toString() ?? "",
      })),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  /**
   * The exercise being dragged, for styling only. The live index is also held in
   * a ref, because a pointermove burst can arrive before React re-renders and
   * the handler must move the row from where it actually is, not from the index
   * of the last render.
   */
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  /** Row count and draft order captured at pointerdown, for hit-testing/revert. */
  const dragCountRef = useRef(0);
  const dragSnapshotRef = useRef<ExerciseDraft[] | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  const libraryById = useMemo(() => {
    const byId: Record<string, RoutineEditorExercise> = {};
    for (const entry of library) byId[entry.id] = entry;
    return byId;
  }, [library]);

  /**
   * Each exercise's type, which chooses its set target fields. The stored tree
   * seeds the map first so an exercise the catalog no longer lists (it may have
   * been archived since the routine was written) still gets the right inputs;
   * the catalog's rows then override with the authoritative value.
   */
  const exerciseTypeById = useMemo(() => {
    const byId: Record<string, ExerciseType> = {};
    for (const e of initial?.exercises ?? []) byId[e.template_id] = e.template.exercise_type;
    for (const entry of library) byId[entry.id] = entry.exercise_type;
    return byId;
  }, [library, initial]);

  /**
   * The target inputs to show for an exercise. An unknown id (only possible if
   * the catalog lost the exercise entirely) shows the set-type selector alone,
   * rather than guessing a shape that may not match.
   */
  function targetFieldsFor(templateId: string): readonly SetTargetField[] {
    const type = exerciseTypeById[templateId];
    return type ? TARGET_FIELDS_BY_TYPE[type] : [];
  }

  const addedIds = new Set(exercises.map((e) => e.template_id));

  /**
   * The Summary's input, derived from the draft. Memoised so typing in the Name
   * field does not recompute it: it only changes when the exercise list does.
   * The editor deliberately does not store any summary value.
   */
  const summaryExercises = useMemo(
    () =>
      exercises.map((ex) => {
        const entry = libraryById[ex.template_id];
        return {
          primaryMuscle: entry?.primary_muscle ?? "",
          secondaryMuscles: entry?.secondary_muscles ?? [],
          sets: ex.sets.map((s) => ({ setType: s.set_type })),
          restSeconds: ex.rest_seconds.trim() === "" ? null : Number(ex.rest_seconds),
        };
      }),
    [exercises, libraryById],
  );

  function addExercise(id: string) {
    if (addedIds.has(id)) return;
    setExercises((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        template_id: id,
        superset_key: null,
        rest_seconds: "",
        notes: "",
        sets: [emptySet()],
      },
    ]);
  }

  function removeExercise(index: number) {
    setExercises((prev) => withNormalisedGroups(prev.filter((_, i) => i !== index)));
  }

  function moveExercise(index: number, dir: -1 | 1) {
    setExercises((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return withNormalisedGroups(next);
    });
  }

  /**
   * Moves the dragged exercise into `to`'s slot. The arrow buttons above remain
   * the keyboard-accessible fallback; this is the pointer path, built on native
   * Pointer Events because no drag library exists and none may be added.
   * Grouping is renormalised because a drag can split or join a superset exactly
   * as a move can. Stable identity so the drag effect does not re-subscribe on
   * every render.
   */
  const reorderExercise = useCallback((from: number, to: number) => {
    if (from === to) return;
    setExercises((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return withNormalisedGroups(next);
    });
  }, []);

  /**
   * The row a pointer at `clientY` would land on: the count of rows whose
   * vertical midpoint the pointer has passed. Read straight from the DOM, so the
   * hit-test stays correct as rows move under the pointer. Clamped to the last
   * row, since a drag past either end means "top"/"bottom" rather than nothing.
   */
  const dropTargetFor = useCallback((clientY: number, count: number): number => {
    let target = 0;
    for (let k = 0; k < count; k++) {
      const row = rowRefs.current[k];
      if (!row) continue;
      const rect = row.getBoundingClientRect();
      if (clientY > rect.top + rect.height / 2) target = k + 1;
    }
    return Math.min(target, count - 1);
  }, []);

  /** Ends a drag: commits the live order, or restores the pre-drag order. */
  const endDrag = useCallback((revert: boolean) => {
    if (revert && dragSnapshotRef.current) setExercises(dragSnapshotRef.current);
    dragIndexRef.current = null;
    dragCountRef.current = 0;
    dragSnapshotRef.current = null;
    setDragIndex(null);
  }, []);

  function onHandlePointerDown(index: number, e: React.PointerEvent<HTMLButtonElement>) {
    // Primary button/pointer only: a secondary click is a context action, and a
    // second touch is not this drag. preventDefault stops the browser from
    // beginning a text selection or a native drag of the glyph.
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    dragIndexRef.current = index;
    dragCountRef.current = exercises.length;
    dragSnapshotRef.current = exercises;
    setDragIndex(index);
  }

  /**
   * The drag runs on window-level listeners rather than pointer capture. A live
   * reorder moves the captured row in the DOM, and Chrome releases pointer
   * capture the moment the captured element moves — which silently aborted the
   * drag. Window listeners are independent of where the row ends up, so they
   * survive every reorder. Escape aborts: restore the order captured at
   * pointerdown.
   */
  useEffect(() => {
    if (dragIndex === null) return;

    const onPointerMove = (e: PointerEvent) => {
      const from = dragIndexRef.current;
      if (from === null) return;
      const target = dropTargetFor(e.clientY, dragCountRef.current);
      if (target === from) return;
      reorderExercise(from, target);
      dragIndexRef.current = target;
      setDragIndex(target);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") endDrag(true);
    };
    // A cancelled pointer never produces a pointerup, so both finish the drag;
    // only cancellation reverts.
    const finishDrag = (e: PointerEvent) => endDrag(e.type === "pointercancel");

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [dragIndex, dropTargetFor, endDrag, reorderExercise]);

  function groupWithNext(index: number) {
    setExercises((prev) => {
      if (index + 1 >= prev.length) return prev;
      const next = prev.map((ex) => ({ ...ex }));
      const key = next[index].superset_key ?? `ss-${crypto.randomUUID().slice(0, 8)}`;
      next[index].superset_key = key;
      next[index + 1].superset_key = key;
      return withNormalisedGroups(next);
    });
  }

  function ungroup(index: number) {
    setExercises((prev) => {
      const next = prev.map((ex) => ({ ...ex }));
      next[index].superset_key = null;
      return withNormalisedGroups(next);
    });
  }

  function patchExercise(index: number, patch: Partial<ExerciseDraft>) {
    setExercises((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  function patchSet(exIndex: number, setIndex: number, patch: Partial<SetDraft>) {
    setExercises((prev) =>
      prev.map((e, i) =>
        i === exIndex
          ? { ...e, sets: e.sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s)) }
          : e,
      ),
    );
  }

  /**
   * Writes one target field of one set. Kept separate from `patchSet` so the
   * field name stays a literal union rather than widening to `string`, which
   * would let a typo in the field map pass typecheck.
   */
  function patchSetValue(exIndex: number, setIndex: number, key: SetDraftValueKey, value: string) {
    setExercises((prev) =>
      prev.map((e, i) =>
        i === exIndex
          ? { ...e, sets: e.sets.map((s, j) => (j === setIndex ? { ...s, [key]: value } : s)) }
          : e,
      ),
    );
  }

  function addSet(exIndex: number) {
    setExercises((prev) =>
      prev.map((e, i) => (i === exIndex ? { ...e, sets: [...e.sets, emptySet()] } : e)),
    );
  }

  function removeSet(exIndex: number, setIndex: number) {
    setExercises((prev) =>
      prev.map((e, i) => (i === exIndex ? { ...e, sets: e.sets.filter((_, j) => j !== setIndex) } : e)),
    );
  }

  async function onSave() {
    if (title.trim() === "") {
      setError("Name is required.");
      return;
    }
    setError(null);
    setSaving(true);

    const input = {
      id: initial?.id,
      title: title.trim(),
      notes: notes.trim() || null,
      exercises: exercises.map((ex) => ({
        template_id: ex.template_id,
        superset_key: ex.superset_key,
        rest_seconds: ex.rest_seconds.trim() === "" ? null : Number(ex.rest_seconds),
        notes: ex.notes.trim() || null,
        sets: ex.sets.map((s) => ({
          set_type: s.set_type,
          reps: s.reps.trim() === "" ? null : Number(s.reps),
          weight_kg: s.weight_kg.trim() || null,
          duration_seconds: s.duration_seconds.trim() === "" ? null : Number(s.duration_seconds),
          distance_meters: s.distance_meters.trim() === "" ? null : Number(s.distance_meters),
          metrics: setMetricsFromDraft(s),
        })),
      })),
    };

    const result = await saveRoutine(input);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    if (result.id) {
      router.push(`/routines/${result.id}`);
      router.refresh();
    }
  }

  return (
    <div className="mt-6">
      {error ? (
        <p role="alert" className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* Two columns from `lg`: the draft on the left, and on the right the compact
          Summary above the exercise Library. The Summary is deliberately the first
          thing in the right column, matching the reference's hierarchy. `minmax(0,1fr)`
          lets a long exercise name wrap rather than widen the left track past the
          page, and below `lg` the tracks stack into the single mobile column. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Name</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>

          <div>
            <h2 className="text-sm font-medium">Exercises</h2>
            {exercises.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                Add an exercise from the Library to get started.
              </p>
            ) : (
              <ol className="mt-2 space-y-3">
                {exercises.map((ex, i) => (
                  <li
                    key={ex.id}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    className={`rounded-lg border border-zinc-200 p-3 ${
                      dragIndex === i ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <button
                          type="button"
                          onPointerDown={(e) => onHandlePointerDown(i, e)}
                          aria-label="Drag to reorder exercise"
                          title="Drag to reorder"
                          className="flex h-9 w-7 shrink-0 touch-none cursor-grab items-center justify-center rounded text-zinc-400 hover:text-zinc-600 active:cursor-grabbing"
                        >
                          ⠿
                        </button>
                        <span className="min-w-0 break-words font-medium">{i + 1}. {libraryById[ex.template_id]?.title ?? "Exercise"}</span>
                        {ex.superset_key ? (
                          <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900">
                            SS
                          </span>
                        ) : null}
                      </span>
                      <div className="flex items-center gap-1">
                        {ex.superset_key ? (
                          <button
                            type="button"
                            onClick={() => ungroup(i)}
                            aria-label="Remove from superset"
                            className="flex h-9 items-center rounded border border-sky-300 px-2 text-xs text-sky-900"
                          >
                            Ungroup
                          </button>
                        ) : i < exercises.length - 1 ? (
                          <button
                            type="button"
                            onClick={() => groupWithNext(i)}
                            aria-label="Superset with the next exercise"
                            className="flex h-9 items-center rounded border px-2 text-xs"
                          >
                            +SS
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => moveExercise(i, -1)}
                          disabled={i === 0}
                          aria-label="Move exercise up"
                          className="flex h-9 w-9 items-center justify-center rounded border text-sm disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveExercise(i, 1)}
                          disabled={i === exercises.length - 1}
                          aria-label="Move exercise down"
                          className="flex h-9 w-9 items-center justify-center rounded border text-sm disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeExercise(i)}
                          aria-label="Remove exercise"
                          className="flex h-9 w-9 items-center justify-center rounded border border-red-200 text-sm text-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-3">
                      <label className="flex items-center gap-1 text-xs text-zinc-600">
                        Rest (s)
                        <input
                          type="number"
                          min={0}
                          value={ex.rest_seconds}
                          onChange={(e) => patchExercise(i, { rest_seconds: e.target.value })}
                          className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="flex flex-1 items-center gap-1 text-xs text-zinc-600">
                        Notes
                        <input
                          value={ex.notes}
                          onChange={(e) => patchExercise(i, { notes: e.target.value })}
                          className="min-w-32 flex-1 rounded border border-zinc-300 px-2 py-1 text-sm"
                        />
                      </label>
                    </div>

                    <div className="mt-2 space-y-1">
                      {ex.sets.map((s, j) => (
                        <div key={j} className="flex flex-wrap items-center gap-2 text-sm">
                          <select
                            value={s.set_type}
                            onChange={(e) => patchSet(i, j, { set_type: e.target.value as SetType })}
                            aria-label="Set type"
                            className="h-10 rounded border border-zinc-300 px-2"
                          >
                            {SET_TYPES.map((t) => (
                              <option key={t} value={t}>{SET_TYPE_LABELS[t]}</option>
                            ))}
                          </select>
                          {targetFieldsFor(ex.template_id).map((field) => {
                            const input = TARGET_FIELD_INPUTS[field];
                            return (
                              <input
                                key={field}
                                type="number"
                                inputMode={input.inputMode}
                                min={0}
                                step={input.step}
                                placeholder={input.placeholder}
                                aria-label={input.label}
                                value={s[input.draftKey]}
                                onChange={(e) => patchSetValue(i, j, input.draftKey, e.target.value)}
                                className="h-10 w-20 rounded border border-zinc-300 px-2"
                              />
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => removeSet(i, j)}
                            aria-label="Remove set"
                            className="flex h-10 items-center rounded px-2 text-xs text-red-600 hover:bg-red-50"
                          >
                            remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addSet(i)}
                        className="flex h-10 items-center rounded border border-dashed border-zinc-300 px-3 text-sm text-zinc-600 hover:bg-zinc-50"
                      >
                        + Add set
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : initial ? "Save changes" : "Create routine"}
            </button>
          </div>
        </div>

        {/* The right column. Summary first, Library second — the reference's order.
            `min-w-0` lets the track shrink below the picker's intrinsic width on a
            phone; without it the filter selects set a min-content floor and the
            page scrolls sideways. */}
        <aside className="min-w-0 space-y-6">
          <RoutineSummaryCard exercises={summaryExercises} onOpen={() => setSummaryOpen(true)} />

          <section className="space-y-2">
            <h2 className="text-sm font-medium">Library</h2>
            <ExercisePicker
              exercises={library}
              muscles={muscles}
              equipment={equipment}
              excludeIds={addedIds}
              onSelect={addExercise}
            />
          </section>
        </aside>
      </div>

      {summaryOpen ? (
        <RoutineSummaryPanel
          exercises={summaryExercises}
          muscles={muscles}
          onClose={() => setSummaryOpen(false)}
        />
      ) : null}
    </div>
  );
}
