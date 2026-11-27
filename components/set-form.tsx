"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ExerciseType, SetMetrics, SetType, WorkoutSet } from "@/schema/types";
import { useI18n } from "@/lib/i18n/context";
import {
  TRAINING_FIELDS, readForteTimer, timerElapsed, trainingValue, validTrainingValue,
  type TrainingField,
} from "@/lib/set-suggestions";

export type SetFormValues = Pick<WorkoutSet, "reps" | "weight_kg" | "duration_seconds" | "distance_meters" | "rpe" | "metrics">;

interface SetFormProps {
  set: WorkoutSet;
  index: number;
  exerciseType: ExerciseType;
  suggestion: Partial<SetFormValues>;
  previous: string;
  disabled?: boolean;
  onUpdate: (patch: Partial<SetFormValues> & { set_type?: SetType }) => Promise<void>;
  onToggle: (values: SetFormValues) => Promise<void>;
  onRemove: () => void;
}

const ROW_GRID = "grid grid-cols-[44px_minmax(0,1fr)_44px] min-[420px]:grid-cols-[44px_minmax(60px,0.8fr)_minmax(0,1.6fr)_44px] items-center gap-2";
const INPUT = "training-input h-11 w-full min-w-0 rounded-lg px-2 text-center text-base disabled:opacity-50";
const TYPES: readonly SetType[] = ["normal", "warmup", "failure", "dropset"];

export function SetGridHeader({ exerciseType }: { exerciseType: ExerciseType }) {
  const { t } = useI18n();
  const fields = TRAINING_FIELDS[exerciseType];
  return (
    <div className={`training-grid ${ROW_GRID} px-2 py-2 text-xs text-[var(--text-muted)]`} aria-hidden="true">
      <span>{t("training.set")}</span>
      <span className="hidden min-[420px]:block">{t("training.previous")}</span>
      <div className={`grid gap-2 ${fields.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {fields.map((field) => <span key={field} className="text-center">{t(field === "weight_kg" && exerciseType === "bodyweight_assisted" ? "training.assistance" : `training.${field}`)}</span>)}
      </div>
      <span className="text-center">✓</span>
    </div>
  );
}

/** Edits persist on change, not blur, so Finish cannot outrun the active input.
 * Local text owns touched fields; later suggestions can only change placeholders. */
export function SetForm({ set, index, exerciseType, suggestion, previous, disabled = false, onUpdate, onToggle, onRemove }: SetFormProps) {
  const { t } = useI18n();
  const fields = TRAINING_FIELDS[exerciseType];
  const [draft, setDraft] = useState<Partial<Record<TrainingField | "rpe", string>>>({});
  const draftRef = useRef(draft);
  const [metricEdits, setMetricEdits] = useState<Partial<SetMetrics>>({});
  const metricRef = useRef(metricEdits);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [now, setNow] = useState(0);
  const sheet = useRef<HTMLDialogElement>(null);
  const errorId = useId();
  const metrics = { ...set.metrics, ...metricEdits };
  const timer = exerciseType === "duration" ? readForteTimer(metrics) : null;
  const running = timer?.startedAt != null;
  const locked = disabled || pending;
  const target = metrics.forte_target;
  const targetRange = fields.includes("reps") && target && typeof target === "object" &&
    "rep_range_start" in target && typeof target.rep_range_start === "number" &&
    "rep_range_end" in target && typeof target.rep_range_end === "number"
    ? `${target.rep_range_start}–${target.rep_range_end} ${t("training.reps")}`
    : null;

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (sheetOpen) sheet.current?.showModal();
    else sheet.current?.close();
  }, [sheetOpen]);

  function save(patch: Partial<SetFormValues> & { set_type?: SetType }) {
    void onUpdate(patch).catch(() => setError(t("training.saveError")));
  }

  function edit(field: TrainingField | "rpe", raw: string) {
    const nextDraft = { ...draftRef.current, [field]: raw };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setError(null);
    const nextMetrics = { ...set.metrics, ...metricRef.current };
    const blanks = new Set(Array.isArray(nextMetrics.forte_blank_fields) ? nextMetrics.forte_blank_fields.filter((item): item is string => typeof item === "string") : []);
    if (raw.trim() === "") blanks.add(field);
    else blanks.delete(field);
    nextMetrics.forte_blank_fields = [...blanks];
    const edits = new Set(Array.isArray(nextMetrics.forte_edited_fields) ? nextMetrics.forte_edited_fields : []);
    edits.add(field);
    nextMetrics.forte_edited_fields = [...edits];
    const valid = field === "rpe"
      ? /^\d{1,2}(\.\d)?$/.test(raw.trim()) && Number(raw) >= 1 && Number(raw) <= 10
      : validTrainingValue(field, raw);
    const value = valid ? Number(raw) : null;
    const patch: Partial<SetFormValues> = {};
    if (field === "floors" || field === "steps") {
      if (value === null) delete nextMetrics[field];
      else nextMetrics[field] = value;
    } else if (field === "weight_kg" || field === "rpe") {
      patch[field] = value === null ? null : raw.trim();
    } else {
      patch[field] = value;
    }
    if (field === "duration_seconds" && exerciseType === "duration") {
      delete nextMetrics.forte_timer;
    }
    metricRef.current = nextMetrics;
    setMetricEdits(nextMetrics);
    save({ ...patch, metrics: nextMetrics });
    if (raw.trim() && !valid) setError(t(field === "rpe" ? "training.invalidRpe" : "training.invalid"));
  }

  async function toggle() {
    const values: SetFormValues = {
      reps: set.reps, weight_kg: set.weight_kg, duration_seconds: set.duration_seconds,
      distance_meters: set.distance_meters, rpe: set.rpe,
      metrics: { ...set.metrics, ...metricRef.current },
    };
    if (!set.completed_at) {
      const blanks = Array.isArray(values.metrics.forte_blank_fields) ? values.metrics.forte_blank_fields : [];
      for (const field of fields) {
        const raw = draftRef.current[field] ?? trainingValue(set, field) ?? (blanks.includes(field) ? null : trainingValue(suggestion, field));
        const actual = field === "duration_seconds" && timer ? timerElapsed(timer) : raw;
        if (!validTrainingValue(field, actual)) {
          setError(t("training.invalid"));
          return;
        }
        if (field === "floors" || field === "steps") values.metrics[field] = Number(actual);
        else if (field === "weight_kg") values.weight_kg = String(actual);
        else values[field] = Number(actual);
      }
      const rpe = draftRef.current.rpe ?? set.rpe;
      if (rpe != null && rpe.trim() !== "" && (!/^\d{1,2}(\.\d)?$/.test(rpe) || Number(rpe) < 1 || Number(rpe) > 10)) {
        setError(t("training.invalidRpe"));
        return;
      }
      values.rpe = rpe?.trim() || null;
      if (timer) {
        values.metrics.forte_timer = { startedAt: null, elapsedSeconds: values.duration_seconds };
        const nextDraft = { ...draftRef.current, duration_seconds: String(values.duration_seconds) };
        draftRef.current = nextDraft;
        setDraft(nextDraft);
      }
    }
    setPending(true);
    setError(null);
    try {
      await onToggle(values);
      metricRef.current = values.metrics;
      setMetricEdits(values.metrics);
    } catch {
      setError(t("training.saveError"));
    } finally {
      setPending(false);
    }
  }

  function toggleTimer() {
    const elapsedSeconds = timer ? timerElapsed(timer) : 0;
    const nextMetrics = {
      ...set.metrics, ...metricRef.current,
      forte_timer: { startedAt: running ? null : new Date().toISOString(), elapsedSeconds },
    };
    metricRef.current = nextMetrics;
    setMetricEdits(nextMetrics);
    if (running) {
      const nextDraft = { ...draftRef.current, duration_seconds: String(elapsedSeconds) };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
    }
    save({ metrics: nextMetrics, ...(running ? { duration_seconds: elapsedSeconds } : {}) });
  }

  return (
    <div
      role="group"
      aria-label={t("training.setLabel", { number: index + 1 })}
      aria-busy={pending}
      className={`rounded-lg px-2 py-2 ${
        set.completed_at
          ? "bg-[var(--bg-completed)] ring-1 ring-inset ring-[var(--border-completed)]"
          : "bg-[var(--bg-surface)]"
      }`}
    >
      <div className={`training-grid ${ROW_GRID}`}>
        <button
          type="button"
          disabled={locked}
          onClick={() => setSheetOpen(true)}
          aria-label={`${t("training.type")}: ${t(`training.${set.set_type}`)}`}
          aria-haspopup="dialog"
          className="h-11 w-11 rounded-lg border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50"
        >
          {set.set_type === "normal" ? index + 1 : set.set_type === "warmup" ? "W" : set.set_type === "failure" ? "F" : "D"}
        </button>
        <span className="hidden min-w-0 break-words text-center text-xs text-[var(--text-muted)] min-[420px]:block">{previous}</span>
        <div className={`grid min-w-0 gap-2 ${fields.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {fields.map((field) => {
            const current = trainingValue(set, field);
            const blank = Array.isArray(metrics.forte_blank_fields) && metrics.forte_blank_fields.includes(field);
            const targetValue: unknown = target && typeof target === "object" && field in target ? Reflect.get(target, field) : undefined;
            const edited = Array.isArray(metrics.forte_edited_fields) && metrics.forte_edited_fields.includes(field);
            const prescribed = !set.completed_at && draft[field] === undefined && !edited && current != null &&
              (typeof targetValue === "number" || typeof targetValue === "string") && Number(current) === Number(targetValue);
            const source = prescribed ? current : trainingValue(suggestion, field);
            const placeholder = blank || source == null ? "—" : String(field === "weight_kg" ? Number(source) : source);
            return (
              <input key={field} type="text" inputMode={field === "weight_kg" || field === "distance_meters" ? "decimal" : "numeric"}
                aria-label={t(field === "weight_kg" && exerciseType === "bodyweight_assisted" ? "training.assistance" : `training.${field}`)}
                aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
                disabled={locked || Boolean(set.completed_at) || (running && field === "duration_seconds")} className={INPUT}
                value={running && field === "duration_seconds" && timer ? timerElapsed(timer, now) : draft[field] ?? (prescribed || current == null ? "" : String(field === "weight_kg" ? Number(current) : current))}
                placeholder={placeholder} onChange={(event) => edit(field, event.target.value)} />
            );
          })}
        </div>
        <button
          type="button"
          disabled={locked}
          onClick={() => void toggle()}
          aria-pressed={Boolean(set.completed_at)}
          aria-label={t(set.completed_at ? "training.undo" : "training.complete")}
          className={`flex h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-50 ${
            set.completed_at
              ? "border-[var(--check-done-bg)] bg-[var(--check-done-bg)] text-[var(--check-done-fg)]"
              : "border-[var(--border-subtle)] bg-[var(--check-idle-bg)] text-[var(--check-idle-fg)]"
          }`}
        >
          <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
        </button>
      </div>
      <p className="mt-1 pl-14 text-xs text-[var(--text-muted)] min-[420px]:hidden">{t("training.previous")}: {previous}</p>
      {targetRange && <p className="mt-1 pl-14 text-xs text-[var(--text-muted)]">{targetRange}</p>}
      {exerciseType === "duration" && (
        <div className="mt-2 pl-14">
          <button type="button" disabled={locked || Boolean(set.completed_at)} onClick={toggleTimer} className="min-h-11 rounded-lg border border-[var(--border-subtle)] px-3 text-sm font-medium text-[var(--accent-text)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50">
            <span aria-hidden="true">{running ? "Ⅱ" : "▶"} </span>{t(running ? "training.pause" : "training.start")}
          </button>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t("training.timerHint")}</p>
        </div>
      )}
      {error && <p id={errorId} role="alert" className="mt-1 text-sm text-[var(--danger-text)]">{error}</p>}
      <dialog ref={sheet} onCancel={() => setSheetOpen(false)} onClose={() => setSheetOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setSheetOpen(false); }}
        aria-label={t("training.type")} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 pb-[calc(1rem+var(--app-safe-bottom))] text-[var(--text-primary)] backdrop:bg-black/60 min-[600px]:inset-0 min-[600px]:m-auto min-[600px]:max-w-sm min-[600px]:rounded-2xl">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{t("training.type")}</h3><button type="button" className="min-h-11 px-3 text-[var(--text-muted)]" onClick={() => setSheetOpen(false)}>{t("training.close")}</button></div>
        {TYPES.map((type) => <button type="button" key={type} disabled={locked} aria-pressed={set.set_type === type} className="flex min-h-12 w-full items-center justify-between rounded-lg px-3 text-left aria-pressed:bg-[var(--accent-soft-bg)]" onClick={() => { save({ set_type: type }); setSheetOpen(false); }}>{t(`training.${type}`)}{set.set_type === type && <span aria-hidden="true">✓</span>}</button>)}
        <label className="mt-3 block border-t border-[var(--border-subtle)] pt-3 text-sm text-[var(--text-muted)]">
          {t("training.rpe")}
          <input type="text" inputMode="decimal" aria-label={t("training.rpe")} disabled={locked || Boolean(set.completed_at)}
            className={`${INPUT} mt-2`} value={draft.rpe ?? set.rpe ?? ""} placeholder="1–10" onChange={(event) => edit("rpe", event.target.value)} />
        </label>
        <div className="mt-3 border-t border-[var(--border-subtle)] pt-3"><button type="button" disabled={locked} className="min-h-12 w-full rounded-lg px-3 text-left text-[var(--danger-text)]" onClick={() => { setSheetOpen(false); onRemove(); }}>{t("training.remove")}</button></div>
      </dialog>
    </div>
  );
}
