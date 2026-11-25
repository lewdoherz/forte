"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ExerciseThumbnail } from "@/components/exercise-media";
import type { VocabularyEntry } from "@/components/exercise-filter-form";
import type { LoggerLibraryExercise } from "@/components/workout-logger";
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
  onAdd,
  onClose,
}: {
  exercises: LoggerLibraryExercise[];
  muscles: VocabularyEntry[];
  equipment: VocabularyEntry[];
  excludeIds: Set<string>;
  onAdd: (templateIds: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
  const muscleNames = useMemo(() => new Map(muscles.map((entry) => [entry.code, entry.display_name])), [muscles]);
  const query = filters.q.trim().toLocaleLowerCase();
  const visible = exercises.filter((exercise) =>
    !excludeIds.has(exercise.id) &&
    (!query || `${exercise.title} ${exercise.slug}`.toLocaleLowerCase().includes(query)) &&
    (!filters.equipment || exercise.equipment === filters.equipment) &&
    (!filters.muscle || exercise.primary_muscle === filters.muscle || exercise.secondary_muscles.includes(filters.muscle)),
  );

  const toggle = (id: string) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const panelStyle = viewportHeight === null ? undefined : {
    height: `max(0px, calc(${viewportHeight}px - 7rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)))`,
  } satisfies CSSProperties;

  return (
    <div className="training training-picker-panel flex h-[70dvh] max-h-full min-h-0 w-full flex-col overflow-hidden text-[var(--text-primary)]" style={panelStyle}>
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
              onChange={(event) => setFilters((previous) => ({ ...previous, muscle: event.target.value }))}
              className="training-input min-h-11 w-full min-w-0 rounded-xl px-2 text-base"
            >
              <option value="">{t("training.picker.muscle")}</option>
              {muscles.map((entry) => <option key={entry.code} value={entry.code}>{entry.display_name}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="sr-only">{t("training.picker.equipment")}</span>
            <select
              value={filters.equipment}
              onChange={(event) => setFilters((previous) => ({ ...previous, equipment: event.target.value }))}
              className="training-input min-h-11 w-full min-w-0 rounded-xl px-2 text-base"
            >
              <option value="">{t("training.picker.equipment")}</option>
              {equipment.map((entry) => <option key={entry.code} value={entry.code}>{entry.display_name}</option>)}
            </select>
          </label>
        </div>
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 text-sm">
          <span className="text-[var(--text-muted)]" role="status">{t("training.picker.selected", { count: selectedIds.length })}</span>
          <div className="flex flex-wrap gap-x-3">
            {hasFilters && <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="min-h-11 text-[var(--accent-text)] underline">{t("training.picker.clearFilters")}</button>}
            {selectedIds.length > 0 && <button type="button" onClick={() => setSelected(new Set())} className="min-h-11 text-[var(--accent-text)] underline">{t("training.picker.clearSelection")}</button>}
          </div>
        </div>
      </div>
      <div ref={results} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {visible.length === 0 ? (
          <p className="px-1 py-5 text-sm text-[var(--text-muted)]">{t(hasFilters ? "training.picker.emptyFiltered" : "training.picker.empty")}</p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {visible.map((exercise) => {
              const checked = selected.has(exercise.id);
              return (
                <li key={exercise.id} className={`flex min-w-0 items-center gap-1 rounded-xl ${checked ? "bg-[var(--accent-soft-bg)]" : ""}`}>
                  <button
                    type="button"
                    aria-pressed={checked}
                    aria-label={t(checked ? "training.picker.deselect" : "training.picker.select", { title: exercise.title })}
                    onClick={() => toggle(exercise.id)}
                    className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--accent-text)]"
                  >
                    <ExerciseThumbnail slug={exercise.slug} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold">{exercise.title}</span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">{muscleNames.get(exercise.primary_muscle) ?? exercise.primary_muscle}</span>
                    </span>
                    <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${checked ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]" : "border-[var(--border-strong)]"}`}>
                      {checked && <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 4 4L19 6" /></svg>}
                    </span>
                  </button>
                  <a
                    href={`/exercises/${encodeURIComponent(exercise.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("training.picker.details", { title: exercise.title })}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)]"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></svg>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="sticky bottom-0 z-10 grid shrink-0 grid-cols-[auto_1fr] gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-semibold hover:bg-[var(--bg-surface-hover)]">{t("training.picker.cancel")}</button>
        <button
          type="button"
          onClick={() => onAdd(selectedIds)}
          disabled={selectedIds.length === 0}
          className="training-action min-h-11 min-w-0 rounded-xl px-3 text-sm font-semibold disabled:opacity-40"
        >{t("training.picker.add", { count: selectedIds.length })}</button>
      </div>
    </div>
  );
}
