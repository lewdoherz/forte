"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExerciseType, RoutineTree, SetType } from "@/schema/types";
import { SET_TYPES } from "@/schema/types";
import { normaliseSupersetKeys } from "@/lib/supersets";
import { saveRoutine } from "@/lib/routine-actions";
import type { RoutineInput } from "@/lib/routines";
import { useI18n } from "@/lib/i18n/context";
import { formatDuration } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n";
import type { VocabularyEntry } from "@/components/exercise-filter-form";
import { ExercisePicker, type PickerExercise } from "@/components/exercise-picker";
import { WorkoutExercisePicker } from "@/components/workout-exercise-picker";
import { ExerciseThumbnail } from "@/components/exercise-media";
import { Modal } from "@/components/modal";
import { RoutineSummaryCard } from "@/components/routine-summary-card";
import { RoutineSummaryPanel } from "@/components/routine-summary-panel";

const SET_TYPE_KEYS: Record<SetType, MessageKey> = {
  warmup: "routines.setType.warmup",
  normal: "routines.setType.normal",
  failure: "routines.setType.failure",
  dropset: "routines.setType.dropset",
};

type SetDraft = {
  id: string;
  set_type: SetType;
  reps: string;
  weight_kg: string;
  duration_seconds: string;
  distance_meters: string;
  floors: string;
  steps: string;
};

type SetDraftValueKey =
  | "reps"
  | "weight_kg"
  | "duration_seconds"
  | "distance_meters"
  | "floors"
  | "steps";

function emptySet(): SetDraft {
  return {
    id: crypto.randomUUID(),
    set_type: "normal",
    reps: "",
    weight_kg: "",
    duration_seconds: "",
    distance_meters: "",
    floors: "",
    steps: "",
  };
}

function setMetricsFromDraft(s: SetDraft): { steps?: number; floors?: number } {
  const metrics: { steps?: number; floors?: number } = {};
  if (s.steps.trim() !== "") metrics.steps = Number(s.steps);
  if (s.floors.trim() !== "") metrics.floors = Number(s.floors);
  return metrics;
}

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

const TARGET_FIELD_INPUTS: Record<
  SetTargetField,
  {
    draftKey: SetDraftValueKey;
    labelKey: MessageKey;
    headerKey: MessageKey;
    placeholderKey: MessageKey;
    inputMode: "numeric" | "decimal";
  }
> = {
  weight: {
    draftKey: "weight_kg",
    labelKey: "routines.target.weight",
    headerKey: "training.weight_kg",
    placeholderKey: "common.unit.kg",
    inputMode: "decimal",
  },
  reps: {
    draftKey: "reps",
    labelKey: "routines.target.reps",
    headerKey: "training.reps",
    placeholderKey: "common.unit.reps",
    inputMode: "numeric",
  },
  duration: {
    draftKey: "duration_seconds",
    labelKey: "routines.target.duration",
    headerKey: "training.duration_seconds",
    placeholderKey: "common.unit.seconds",
    inputMode: "numeric",
  },
  distance: {
    draftKey: "distance_meters",
    labelKey: "routines.target.distance",
    headerKey: "training.distance_meters",
    placeholderKey: "common.unit.m",
    inputMode: "numeric",
  },
  floors: {
    draftKey: "floors",
    labelKey: "routines.target.floors",
    headerKey: "training.floors",
    placeholderKey: "common.unit.floors",
    inputMode: "numeric",
  },
  steps: {
    draftKey: "steps",
    labelKey: "routines.target.steps",
    headerKey: "training.steps",
    placeholderKey: "common.unit.steps",
    inputMode: "numeric",
  },
};

const REST_PRESETS = [0, 30, 45, 60, 90, 120, 180, 300];
const EXERCISE_CARD = "training-panel overflow-hidden rounded-2xl p-3 sm:p-5";
const SET_ROW_GRID = "grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2";
const SET_INPUT = "training-input h-11 w-full min-w-0 rounded-lg px-2 text-center text-base";

type ExerciseDraft = {
  id: string;
  template_id: string;
  superset_key: string | null;
  rest_seconds: string;
  notes: string;
  sets: SetDraft[];
};

function withNormalisedGroups(next: ExerciseDraft[]): ExerciseDraft[] {
  const keys = normaliseSupersetKeys(next);
  return next.map((ex, i) => (ex.superset_key === keys[i] ? ex : { ...ex, superset_key: keys[i] }));
}

function setTypeBadge(type: SetType, index: number): string {
  if (type === "normal") return String(index + 1);
  if (type === "warmup") return "W";
  if (type === "failure") return "F";
  return "D";
}

export interface RoutineEditorExercise extends PickerExercise {
  secondary_muscles: string[];
  exercise_type: ExerciseType;
  equipment?: string;
}

interface RoutineEditorProps {
  library: RoutineEditorExercise[];
  muscles: VocabularyEntry[];
  equipment: VocabularyEntry[];
  initial?: RoutineTree;
  /** Optional override for offline saving inside the offline app shell. */
  onSaveOverride?: (input: RoutineInput) => Promise<{ id?: string; error?: string }>;
  onCancel?: () => void;
}

/**
 * Routine template editor aligned with the active WorkoutLogger:
 * shared exercise cards, circular thumbnails, typed set grid, bottom-sheet set
 * type picker, rest override dialog, collapsible notes, and keyboard-safe mobile picker.
 */
export function RoutineEditor({
  library,
  muscles,
  equipment,
  initial,
  onSaveOverride,
  onCancel,
}: RoutineEditorProps) {
  const router = useRouter();
  const i18n = useI18n();
  const { locale, t } = i18n;
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
        id: crypto.randomUUID(),
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [restModalIndex, setRestModalIndex] = useState<number | null>(null);
  const [setTypeSheet, setSetTypeSheet] = useState<{ exIndex: number; setIndex: number } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const dragCountRef = useRef(0);
  const dragSnapshotRef = useRef<ExerciseDraft[] | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  const libraryById = useMemo(() => {
    const byId: Record<string, RoutineEditorExercise> = {};
    for (const entry of library) byId[entry.id] = entry;
    return byId;
  }, [library]);

  const muscleNames = useMemo(
    () => new Map(muscles.map((m) => [m.code, m.display_name])),
    [muscles],
  );

  const initialTemplateById = useMemo(() => {
    const byId: Record<string, { slug: string; title: string; primary_muscle: string; exercise_type: ExerciseType }> = {};
    for (const e of initial?.exercises ?? []) {
      byId[e.template_id] = {
        slug: e.template.slug,
        title: e.template.title,
        primary_muscle: e.template.primary_muscle,
        exercise_type: e.template.exercise_type,
      };
    }
    return byId;
  }, [initial]);

  const exerciseTypeById = useMemo(() => {
    const byId: Record<string, ExerciseType> = {};
    for (const e of initial?.exercises ?? []) byId[e.template_id] = e.template.exercise_type;
    for (const entry of library) byId[entry.id] = entry.exercise_type;
    return byId;
  }, [library, initial]);

  const pickerExercises = useMemo(
    () =>
      library.map((e) => ({
        ...e,
        equipment: e.equipment ?? "",
      })),
    [library],
  );

  function targetFieldsFor(templateId: string): readonly SetTargetField[] {
    const type = exerciseTypeById[templateId];
    return type ? TARGET_FIELDS_BY_TYPE[type] : [];
  }

  const addedIds = useMemo(() => new Set(exercises.map((e) => e.template_id)), [exercises]);

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

  function addExercises(ids: string[]) {
    setPickerOpen(false);
    setExercises((prev) => {
      const existing = new Set(prev.map((e) => e.template_id));
      const added: ExerciseDraft[] = [];
      for (const id of ids) {
        if (existing.has(id)) continue;
        existing.add(id);
        added.push({
          id: crypto.randomUUID(),
          template_id: id,
          superset_key: null,
          rest_seconds: "",
          notes: "",
          sets: [emptySet()],
        });
      }
      return added.length ? [...prev, ...added] : prev;
    });
  }

  function addExercise(id: string) {
    addExercises([id]);
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

  const endDrag = useCallback((revert: boolean) => {
    if (revert && dragSnapshotRef.current) setExercises(dragSnapshotRef.current);
    dragIndexRef.current = null;
    dragCountRef.current = 0;
    dragSnapshotRef.current = null;
    setDragIndex(null);
  }, []);

  function onHandlePointerDown(index: number, e: React.PointerEvent<HTMLButtonElement>) {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    dragIndexRef.current = index;
    dragCountRef.current = exercises.length;
    dragSnapshotRef.current = exercises;
    setDragIndex(index);
  }

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
      prev.map((e, i) =>
        i === exIndex ? { ...e, sets: e.sets.filter((_, j) => j !== setIndex) } : e,
      ),
    );
  }

  async function onSave() {
    if (title.trim() === "") {
      setError(t("routines.editor.nameRequired"));
      return;
    }
    setError(null);
    setSaving(true);

    const input: RoutineInput = {
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

    try {
      const result = onSaveOverride ? await onSaveOverride(input) : await saveRoutine(input);
      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }
      if (!onSaveOverride && result.id) {
        router.push(`/routines/${result.id}`);
        router.refresh();
      } else {
        setSaving(false);
      }
    } catch {
      setError(t("routines.error.saveFailed"));
      setSaving(false);
    }
  }

  // Group consecutive superset exercises visually, matching WorkoutLogger.
  const groups: { key: string | null; items: { ex: ExerciseDraft; index: number }[] }[] = [];
  exercises.forEach((ex, index) => {
    const previous = groups.at(-1);
    if (ex.superset_key !== null && previous && previous.key === ex.superset_key) {
      previous.items.push({ ex, index });
    } else {
      groups.push({ key: ex.superset_key, items: [{ ex, index }] });
    }
  });

  function renderExerciseCard(ex: ExerciseDraft, i: number) {
    const info = libraryById[ex.template_id] ?? initialTemplateById[ex.template_id];
    const exType = exerciseTypeById[ex.template_id];
    const fields = targetFieldsFor(ex.template_id);
    const restNum = ex.rest_seconds.trim() === "" ? null : Number(ex.rest_seconds);
    const restDisplay =
      restNum === null || Number.isNaN(restNum)
        ? t("routines.editor.restDefault")
        : restNum === 0
          ? t("logger.rest.off")
          : formatDuration(locale, restNum);

    return (
      <>
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            onPointerDown={(e) => onHandlePointerDown(i, e)}
            aria-label={t("routines.editor.dragHandle")}
            title={t("routines.editor.dragTitle")}
            className="mt-1 flex h-11 w-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] active:cursor-grabbing"
          >
            ⠿
          </button>
          {info?.slug ? <ExerciseThumbnail slug={info.slug} size="md" /> : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="min-w-0 break-words text-base font-semibold leading-snug">
                {i + 1}. {info?.title ?? t("routines.editor.unknownExercise")}
              </h3>
              {ex.superset_key ? (
                <span className="shrink-0 rounded-full border border-[var(--badge-border)] bg-[var(--badge-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--badge-text)]">
                  {t("routines.supersetBadge")}
                </span>
              ) : null}
            </div>
            {info?.primary_muscle ? (
              <p className="training-muted mt-0.5 text-xs">
                {muscleNames.get(info.primary_muscle) ?? info.primary_muscle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => removeExercise(i)}
            aria-label={t("routines.editor.removeExercise")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger-text)]"
          >
            ✕
          </button>
        </div>

        {/* Action & rest/notes toolbar — mirrors WorkoutLogger spacing & touch targets */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRestModalIndex(i)}
            className="min-h-11 rounded-xl border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
          >
            {t("logger.rest.setting", { value: restDisplay })}
          </button>

          {ex.superset_key ? (
            <button
              type="button"
              onClick={() => ungroup(i)}
              aria-label={t("routines.editor.removeFromSuperset")}
              className="min-h-11 rounded-xl border border-[var(--border-strong)] bg-[var(--accent-soft-bg)] px-3 text-xs font-semibold text-[var(--accent-text)]"
            >
              {t("routines.editor.ungroup")}
            </button>
          ) : i < exercises.length - 1 ? (
            <button
              type="button"
              onClick={() => groupWithNext(i)}
              aria-label={t("routines.editor.groupWithNext")}
              className="min-h-11 rounded-xl border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
            >
              {t("routines.editor.supersetShort")}
            </button>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => moveExercise(i, -1)}
              disabled={i === 0}
              aria-label={t("routines.editor.moveUp")}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-subtle)] text-sm hover:bg-[var(--bg-surface-hover)] disabled:opacity-35"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveExercise(i, 1)}
              disabled={i === exercises.length - 1}
              aria-label={t("routines.editor.moveDown")}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-subtle)] text-sm hover:bg-[var(--bg-surface-hover)] disabled:opacity-35"
            >
              ↓
            </button>
          </div>
        </div>

        {/* Collapsible exercise notes matching WorkoutLogger */}
        <details className="mt-2" open={Boolean(ex.notes)}>
          <summary className="training-muted flex min-h-10 cursor-pointer items-center px-1 text-sm">
            {t("logger.exercise.notes")}
            {ex.notes ? " •" : ""}
          </summary>
          <textarea
            aria-label={t("routines.editor.notes")}
            value={ex.notes}
            maxLength={500}
            rows={2}
            placeholder={t("routines.editor.exerciseNotesPlaceholder")}
            onChange={(e) => patchExercise(i, { notes: e.target.value })}
            className="training-input mt-1 min-h-16 w-full rounded-xl p-3 text-base"
          />
        </details>

        {/* Typed set grid matching SetGridHeader + SetForm */}
        <div
          className={`${SET_ROW_GRID} mt-2 px-1 py-1.5 text-xs text-[var(--text-muted)]`}
          aria-hidden="true"
        >
          <span className="text-center">{t("routines.editor.setColumn")}</span>
          <div className={`grid gap-2 ${fields.length <= 1 ? "grid-cols-1" : "grid-cols-2"}`}>
            {fields.map((field) => (
              <span key={field} className="text-center">
                {t(
                  field === "weight" && exType === "bodyweight_assisted"
                    ? "training.assistance"
                    : TARGET_FIELD_INPUTS[field].headerKey,
                )}
              </span>
            ))}
          </div>
          <span className="sr-only">{t("common.remove")}</span>
        </div>

        <div className="space-y-1.5">
          {ex.sets.map((s, j) => (
            <div key={s.id} className={`${SET_ROW_GRID} rounded-lg px-1 py-1`}>
              <button
                type="button"
                onClick={() => setSetTypeSheet({ exIndex: i, setIndex: j })}
                aria-label={`${t("routines.editor.setType")}: ${t(SET_TYPE_KEYS[s.set_type])}`}
                aria-haspopup="dialog"
                className="h-11 w-11 rounded-lg border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
              >
                {setTypeBadge(s.set_type, j)}
              </button>

              <div className={`grid min-w-0 gap-2 ${fields.length <= 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                {fields.map((field) => {
                  const input = TARGET_FIELD_INPUTS[field];
                  return (
                    <input
                      key={field}
                      type="text"
                      inputMode={input.inputMode}
                      placeholder={t(input.placeholderKey)}
                      aria-label={t(input.labelKey)}
                      value={s[input.draftKey]}
                      onChange={(e) => patchSetValue(i, j, input.draftKey, e.target.value)}
                      className={SET_INPUT}
                    />
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => removeSet(i, j)}
                aria-label={t("routines.editor.removeSet")}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--danger-text)] hover:bg-[var(--danger-bg)]"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => addSet(i)}
          className="mt-3 min-h-11 w-full rounded-xl border border-dashed border-[var(--border-strong)] px-3 text-sm font-semibold text-[var(--accent-text)] hover:bg-[var(--bg-surface-hover)]"
        >
          {t("routines.editor.addSet")}
        </button>
      </>
    );
  }

  const activeRestExercise = restModalIndex !== null ? exercises[restModalIndex] : null;
  const activeRestParsed =
    activeRestExercise && activeRestExercise.rest_seconds.trim() !== ""
      ? Number(activeRestExercise.rest_seconds)
      : null;

  const activeSetTypeTarget =
    setTypeSheet && exercises[setTypeSheet.exIndex]?.sets[setTypeSheet.setIndex]
      ? {
          exIndex: setTypeSheet.exIndex,
          setIndex: setTypeSheet.setIndex,
          set: exercises[setTypeSheet.exIndex].sets[setTypeSheet.setIndex],
        }
      : null;

  return (
    <div className="mt-4">
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-sm text-[var(--danger-text)]"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-4">
          <section className="training-panel space-y-4 rounded-2xl p-4 sm:p-5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("routines.editor.name")}</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={120}
                className="training-input min-h-11 w-full rounded-xl px-3 py-2 text-base"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("routines.editor.notesOptional")}</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="training-input w-full rounded-xl px-3 py-2 text-base"
              />
            </label>
          </section>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-muted)]">
                {t("routines.editor.exercises")} ({exercises.length})
              </h2>
              <button
                type="button"
                onClick={() => setSummaryOpen(true)}
                className="min-h-10 rounded-xl px-2.5 text-xs font-semibold text-[var(--accent-text)] hover:bg-[var(--bg-surface-hover)] lg:hidden"
              >
                {t("routines.summary.cardTitle")}
              </button>
            </div>

            {exercises.length === 0 ? (
              <div className="training-panel rounded-2xl border-dashed px-5 py-8 text-center">
                <p className="text-sm text-[var(--text-muted)]">{t("routines.editor.emptyLibraryHint")}</p>
              </div>
            ) : (
              <ol className="space-y-4">
                {groups.map((group) => {
                  const superset = group.key !== null && group.items.length > 1;
                  if (superset) {
                    return (
                      <li
                        key={group.items[0].ex.id}
                        className="rounded-2xl border border-[var(--border-strong)] p-2"
                      >
                        <p className="mb-2 px-2 text-xs font-semibold text-[var(--accent-text)]">
                          {t("logger.superset.title")} · {t("logger.superset.hint")}
                        </p>
                        <div className="space-y-3">
                          {group.items.map(({ ex, index }) => (
                            <section
                              key={ex.id}
                              ref={(el) => {
                                rowRefs.current[index] = el as unknown as HTMLLIElement;
                              }}
                              className={`${EXERCISE_CARD} ${dragIndex === index ? "opacity-50" : ""}`}
                            >
                              {renderExerciseCard(ex, index)}
                            </section>
                          ))}
                        </div>
                      </li>
                    );
                  }
                  const { ex, index } = group.items[0];
                  return (
                    <li
                      key={ex.id}
                      ref={(el) => {
                        rowRefs.current[index] = el;
                      }}
                      className={`${EXERCISE_CARD} ${dragIndex === index ? "opacity-50" : ""}`}
                    >
                      {renderExerciseCard(ex, index)}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-4 text-base font-semibold text-[var(--accent-text)] hover:bg-[var(--bg-surface-hover)]"
            >
              + {t("routines.editor.addExercise")}
            </button>

            <div className="flex flex-wrap items-center gap-3">
              {onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={saving}
                  className="min-h-12 rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-semibold hover:bg-[var(--bg-surface-hover)]"
                >
                  {t("common.cancel")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={saving}
                className="training-action min-h-12 flex-1 rounded-xl px-5 text-sm font-bold disabled:opacity-60 sm:flex-none"
              >
                {saving
                  ? t("common.saving")
                  : initial
                    ? t("common.saveChanges")
                    : t("routines.create")}
              </button>
            </div>
          </div>
        </div>

        {/* Desktop right column: Summary + Library */}
        <aside className="hidden min-w-0 space-y-6 lg:block">
          <RoutineSummaryCard exercises={summaryExercises} onOpen={() => setSummaryOpen(true)} />
          <section className="space-y-2">
            <h2 className="text-sm font-medium">{t("routines.editor.library")}</h2>
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

      {/* Keyboard-aware exercise picker modal (matches WorkoutLogger) */}
      {pickerOpen ? (
        <Modal
          title={t("routines.editor.addExercise")}
          onClose={() => setPickerOpen(false)}
          variant="training"
          panelClassName="training-picker-modal max-w-xl"
        >
          <WorkoutExercisePicker
            exercises={pickerExercises}
            muscles={muscles}
            equipment={equipment}
            excludeIds={addedIds}
            onAdd={addExercises}
            onClose={() => setPickerOpen(false)}
          />
        </Modal>
      ) : null}

      {/* Per-exercise rest override dialog */}
      {restModalIndex !== null && activeRestExercise ? (
        <Modal
          title={libraryById[activeRestExercise.template_id]?.title ?? t("logger.rest.duration")}
          onClose={() => setRestModalIndex(null)}
          variant="training"
          panelClassName="max-w-sm"
        >
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => patchExercise(restModalIndex, { rest_seconds: "" })}
                className={`min-h-11 rounded-xl border text-xs font-semibold ${
                  activeRestExercise.rest_seconds.trim() === ""
                    ? "training-action border-transparent"
                    : "border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]"
                }`}
              >
                {t("routines.editor.restDefault")}
              </button>
              {REST_PRESETS.map((seconds) => {
                const selected = activeRestParsed === seconds;
                return (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => patchExercise(restModalIndex, { rest_seconds: String(seconds) })}
                    className={`min-h-11 rounded-xl border text-xs font-semibold ${
                      selected
                        ? "training-action border-transparent"
                        : "border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]"
                    }`}
                  >
                    {seconds === 0 ? t("logger.rest.off") : formatDuration(locale, seconds)}
                  </button>
                );
              })}
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="text-[var(--text-muted)]">{t("routines.editor.restCustom")}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={86400}
                value={activeRestExercise.rest_seconds}
                placeholder={t("routines.editor.restDefault")}
                onChange={(e) => patchExercise(restModalIndex, { rest_seconds: e.target.value })}
                className="training-input min-h-11 w-full rounded-xl px-3 text-base"
              />
            </label>

            <button
              type="button"
              onClick={() => setRestModalIndex(null)}
              className="training-action min-h-11 w-full rounded-xl px-4 font-semibold"
            >
              {t("common.done")}
            </button>
          </div>
        </Modal>
      ) : null}

      {/* Set type bottom sheet / modal (matches SetForm) */}
      {activeSetTypeTarget ? (
        <Modal
          title={t("routines.editor.setType")}
          onClose={() => setSetTypeSheet(null)}
          variant="training"
          panelClassName="max-w-sm"
        >
          <div className="mt-3 space-y-1">
            {SET_TYPES.map((type) => {
              const selected = activeSetTypeTarget.set.set_type === type;
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    patchSet(activeSetTypeTarget.exIndex, activeSetTypeTarget.setIndex, { set_type: type });
                    setSetTypeSheet(null);
                  }}
                  className="flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left hover:bg-[var(--bg-surface-hover)] aria-pressed:bg-[var(--accent-soft-bg)] aria-pressed:font-semibold"
                >
                  <span>{t(SET_TYPE_KEYS[type])}</span>
                  {selected ? <span aria-hidden="true">✓</span> : null}
                </button>
              );
            })}
            <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
              <button
                type="button"
                onClick={() => {
                  removeSet(activeSetTypeTarget.exIndex, activeSetTypeTarget.setIndex);
                  setSetTypeSheet(null);
                }}
                className="min-h-12 w-full rounded-xl px-3 text-left text-[var(--danger-text)] hover:bg-[var(--danger-bg)]"
              >
                {t("routines.editor.removeSet")}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {summaryOpen ? (
        <RoutineSummaryPanel
          exercises={summaryExercises}
          muscles={muscles}
          onClose={() => setSummaryOpen(false)}
          i18n={i18n}
        />
      ) : null}
    </div>
  );
}
