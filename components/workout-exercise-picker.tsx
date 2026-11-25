"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ExerciseThumbnail } from "@/components/exercise-media";
import { ExerciseDetailView } from "@/components/exercise-detail-view";
import type { VocabularyEntry } from "@/components/exercise-filter-form";
import type { LoggerLibraryExercise } from "@/components/workout-logger";
import type { OfflineCatalogExercise } from "@/lib/offline-store";
import type { LoggedWorkout } from "@/lib/workout-sync";
import { useI18n } from "@/lib/i18n/context";

interface Filters {
  q: string;
  muscle: string;
  equipment: string;
}

const EMPTY_FILTERS: Filters = { q: "", muscle: "", equipment: "" };

export function WorkoutExercisePicker({
  exercises,
  muscles,
  equipment,
  excludeIds,
  recentIds = [],
  workouts = [],
  timeZone = "UTC",
  onAdd,
  onClose,
}: {
  exercises: LoggerLibraryExercise[];
  muscles: VocabularyEntry[];
  equipment: VocabularyEntry[];
  excludeIds: Set<string>;
  recentIds?: string[];
  workouts?: LoggedWorkout[];
  timeZone?: string;
  onAdd: (templateIds: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const results = useRef<HTMLDivElement>(null);
  const hasFilters = Boolean(filters.q || filters.muscle || filters.equipment);

  useEffect(() => {
    results.current?.scrollTo({ top: 0 });
  }, [filters]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => setViewportHeight(viewport?.height ?? window.innerHeight);
    const initial = window.setTimeout(resize, 0);
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(initial);
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const selectedIds = exercises
    .filter((exercise) => selected.has(exercise.id) && !excludeIds.has(exercise.id))
    .map((exercise) => exercise.id);
  const muscleNames = useMemo(
    () => new Map(muscles.map((entry) => [entry.code, entry.display_name])),
    [muscles],
  );
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const query = filters.q.trim().toLocaleLowerCase();
  const visible = useMemo(
    () =>
      exercises.filter(
        (exercise) =>
          !excludeIds.has(exercise.id) &&
          (!query || `${exercise.title} ${exercise.slug}`.toLocaleLowerCase().includes(query)) &&
          (!filters.equipment || exercise.equipment === filters.equipment) &&
          (!filters.muscle ||
            exercise.primary_muscle === filters.muscle ||
            exercise.secondary_muscles.includes(filters.muscle)),
      ),
    [exercises, excludeIds, query, filters.equipment, filters.muscle],
  );

  const recentVisible = useMemo(() => {
    if (hasFilters || recentIds.length === 0) return [];
    const list: LoggerLibraryExercise[] = [];
    for (const id of recentIds) {
      if (excludeIds.has(id)) continue;
      const ex = byId.get(id);
      if (ex) list.push(ex);
      if (list.length >= 8) break;
    }
    return list;
  }, [hasFilters, recentIds, excludeIds, byId]);

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const panelStyle =
    viewportHeight === null
      ? undefined
      : ({
          height: `max(0px, calc(${viewportHeight}px - 7rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)))`,
        } satisfies CSSProperties);

  const inspectingExercise = inspectingId ? byId.get(inspectingId) : undefined;
  const inspectingCatalog: OfflineCatalogExercise | null = inspectingExercise
    ? {
        id: inspectingExercise.id,
        slug: inspectingExercise.slug,
        title: inspectingExercise.title,
        primary_muscle: inspectingExercise.primary_muscle,
        secondary_muscles: inspectingExercise.secondary_muscles,
        equipment: inspectingExercise.equipment,
        exercise_type: inspectingExercise.exercise_type,
        how_to: inspectingExercise.how_to ?? null,
        media_url: inspectingExercise.media_url ?? null,
        duration_record_direction: inspectingExercise.duration_record_direction ?? "higher",
        is_custom: inspectingExercise.is_custom ?? false,
      }
    : null;

  if (inspectingCatalog) {
    const isSelected = selected.has(inspectingCatalog.id);
    return (
      <div
        className="training training-picker-panel flex h-[70dvh] max-h-full min-h-0 w-full flex-col overflow-hidden text-[var(--text-primary)]"
        style={panelStyle}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
          <ExerciseDetailView
            exercise={inspectingCatalog}
            muscles={muscles}
            equipment={equipment}
            workouts={workouts}
            timeZone={timeZone}
            compact
            backLabel={t("offline.picker.back")}
            onBack={() => setInspectingId(null)}
          />
        </div>
        <div className="sticky bottom-0 z-10 grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setInspectingId(null)}
            className="min-h-11 rounded-xl border border-[var(--border-subtle)] px-3 text-sm font-semibold hover:bg-[var(--bg-surface-hover)]"
          >
            ← {t("offline.picker.back")}
          </button>
          <button
            type="button"
            onClick={() => {
              toggle(inspectingCatalog.id);
              setInspectingId(null);
            }}
            className="training-action min-h-11 rounded-xl px-3 text-sm font-semibold"
          >
            {t(isSelected ? "training.picker.deselect" : "training.picker.select", {
              title: inspectingCatalog.title,
            })}
          </button>
        </div>
      </div>
    );
  }

  function renderRow(exercise: LoggerLibraryExercise, keyPrefix: string) {
    const checked = selected.has(exercise.id);
    return (
      <li
        key={`${keyPrefix}-${exercise.id}`}
        className={`flex min-w-0 items-center gap-1 rounded-xl ${checked ? "bg-[var(--accent-soft-bg)]" : ""}`}
      >
        <button
          type="button"
          aria-pressed={checked}
          aria-label={t(checked ? "training.picker.deselect" : "training.picker.select", {
            title: exercise.title,
          })}
          onClick={() => toggle(exercise.id)}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--accent-text)]"
        >
          <ExerciseThumbnail slug={exercise.slug} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-semibold">{exercise.title}</span>
            <span className="mt-1 block text-xs text-[var(--text-muted)]">
              {muscleNames.get(exercise.primary_muscle) ?? exercise.primary_muscle}
            </span>
          </span>
          <span
            aria-hidden="true"
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
              checked
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                : "border-[var(--border-strong)]"
            }`}
          >
            {checked && (
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setInspectingId(exercise.id)}
          aria-label={t("training.picker.details", { title: exercise.title })}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v6m0-10v1" />
          </svg>
        </button>
      </li>
    );
  }

  return (
    <div
      className="training training-picker-panel flex h-[70dvh] max-h-full min-h-0 w-full flex-col overflow-hidden text-[var(--text-primary)]"
      style={panelStyle}
    >
      <div className="min-h-0 shrink space-y-2 overflow-y-auto overscroll-contain border-b border-[var(--border-subtle)] pb-3">
        <label className="block">
          <span className="sr-only">{t("training.picker.search")}</span>
          <input
            type="search"
            value={filters.q}
            onChange={(event) => setFilters((previous) => ({ ...previous, q: event.target.value }))}
            placeholder={t("training.picker.search")}
            autoComplete="off"
            className="training-input min-h-11 w-full min-w-0 rounded-xl px-3 text-base"
          />
        </label>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <label className="min-w-0">
            <span className="sr-only">{t("training.picker.muscle")}</span>
            <select
              value={filters.muscle}
              onChange={(event) =>
                setFilters((previous) => ({ ...previous, muscle: event.target.value }))
              }
              className="training-input min-h-11 w-full min-w-0 rounded-xl px-2 text-base"
            >
              <option value="">{t("training.picker.muscle")}</option>
              {muscles.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="sr-only">{t("training.picker.equipment")}</span>
            <select
              value={filters.equipment}
              onChange={(event) =>
                setFilters((previous) => ({ ...previous, equipment: event.target.value }))
              }
              className="training-input min-h-11 w-full min-w-0 rounded-xl px-2 text-base"
            >
              <option value="">{t("training.picker.equipment")}</option>
              {equipment.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.display_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 text-sm">
          <span className="text-[var(--text-muted)]" role="status">
            {t("training.picker.selected", { count: selectedIds.length })}
          </span>
          <div className="flex flex-wrap gap-x-3">
            {hasFilters && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="min-h-11 text-[var(--accent-text)] underline"
              >
                {t("training.picker.clearFilters")}
              </button>
            )}
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="min-h-11 text-[var(--accent-text)] underline"
              >
                {t("training.picker.clearSelection")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div ref={results} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {recentVisible.length > 0 ? (
          <div className="border-b border-[var(--border-subtle)] pb-2 pt-2">
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {t("offline.picker.recent")}
            </p>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {recentVisible.map((ex) => renderRow(ex, "recent"))}
            </ul>
          </div>
        ) : null}

        {visible.length === 0 ? (
          <p className="px-1 py-5 text-sm text-[var(--text-muted)]">
            {t(hasFilters ? "training.picker.emptyFiltered" : "training.picker.empty")}
          </p>
        ) : (
          <div>
            {recentVisible.length > 0 ? (
              <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t("offline.picker.all")}
              </p>
            ) : null}
            <ul className="divide-y divide-[var(--border-subtle)]">
              {visible.map((exercise) => renderRow(exercise, "all"))}
            </ul>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 grid shrink-0 grid-cols-[auto_1fr] gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-semibold hover:bg-[var(--bg-surface-hover)]"
        >
          {t("training.picker.cancel")}
        </button>
        <button
          type="button"
          onClick={() => onAdd(selectedIds)}
          disabled={selectedIds.length === 0}
          className="training-action min-h-11 min-w-0 rounded-xl px-3 text-sm font-semibold disabled:opacity-40"
        >
          {t("training.picker.add", { count: selectedIds.length })}
        </button>
      </div>
    </div>
  );
}
