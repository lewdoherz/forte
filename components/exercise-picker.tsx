"use client";

import { useEffect, useState, useTransition } from "react";
import { ExerciseThumbnail } from "@/components/exercise-media";
import {
  EMPTY_EXERCISE_FILTERS,
  ExerciseFilterForm,
  type ExerciseFilterValues,
  type VocabularyEntry,
} from "@/components/exercise-filter-form";
import { listExercisesAction } from "@/lib/exercise-actions";
import type { LibraryExercise } from "@/lib/exercise-library";

/**
 * The fields a picker row renders. Deliberately narrower than `LibraryExercise`:
 * the editor's catalog slice does not carry `is_custom`, and the picker has no
 * use for it, so requiring it would force callers to fabricate a value.
 */
export interface PickerExercise {
  id: string;
  slug: string;
  title: string;
  primary_muscle: string;
}

/**
 * Exercise selection for the routine editor.
 *
 * It reuses the Library's own filter control (`ExerciseFilterForm`) over the same
 * `listExercisesAction`, so search/equipment/muscle filtering has a single
 * implementation rather than a second picker that drifts. Rows are buttons, not
 * links: the editor holds the draft in local state and must not navigate away.
 *
 * `exercises` is the full visible catalog the editor already received, so the
 * unfiltered list needs no round trip; the service is asked only once a filter is
 * set. Its rows are a subset of that catalog, so a chosen id always resolves.
 */
export function ExercisePicker({
  exercises,
  muscles,
  equipment,
  excludeIds,
  onSelect,
}: {
  exercises: PickerExercise[];
  muscles: VocabularyEntry[];
  equipment: VocabularyEntry[];
  /** Ids already in the draft; the picker hides them. */
  excludeIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) {
  const [filters, setFilters] = useState<ExerciseFilterValues>(EMPTY_EXERCISE_FILTERS);
  const [result, setResult] = useState<{ key: string; rows: LibraryExercise[] } | null>(null);
  const [pending, startTransition] = useTransition();

  const filterKey = `${filters.q}|${filters.muscle}|${filters.equipment}`;
  const hasFilters = Boolean(filters.q || filters.muscle || filters.equipment);

  useEffect(() => {
    if (!hasFilters) return;
    let active = true;
    startTransition(async () => {
      const rows = await listExercisesAction({
        q: filters.q,
        muscle: filters.muscle,
        equipment: filters.equipment,
      });
      // A response from an earlier filter must not land after a newer one.
      if (active) setResult({ key: filterKey, rows });
    });
    return () => {
      active = false;
    };
  }, [filters.q, filters.muscle, filters.equipment, filterKey, hasFilters]);

  // While the request for the current filters is outstanding, show a loading
  // line rather than the previous rows, so a filtered view never lies.
  const filtered = result?.key === filterKey ? result.rows : null;
  const rows = hasFilters ? filtered : exercises;
  const visible = rows === null ? null : rows.filter((row) => !excludeIds.has(row.id));
  const muscleNames: Record<string, string> = {};
  for (const entry of muscles) muscleNames[entry.code] = entry.display_name;

  return (
    <div className="rounded-md border border-zinc-200">
      <ExerciseFilterForm
        key={filterKey}
        muscles={muscles}
        equipment={equipment}
        values={filters}
        onSubmit={setFilters}
        onClear={() => setFilters(EMPTY_EXERCISE_FILTERS)}
      />
      <div className={`max-h-72 overflow-y-auto ${pending ? "opacity-60" : ""}`}>
        {visible === null ? (
          <p className="px-4 py-6 text-sm text-zinc-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">
            {hasFilters ? "No matching exercises." : "No exercises available."}
          </p>
        ) : (
          <ul>
            {visible.map((exercise) => (
              <li
                key={exercise.id}
                className="border-b border-zinc-100 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => onSelect(exercise.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-50"
                >
                  <ExerciseThumbnail slug={exercise.slug} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{exercise.title}</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {muscleNames[exercise.primary_muscle] ?? exercise.primary_muscle}
                    </span>
                  </span>
                  <span className="shrink-0 rounded border border-zinc-300 px-3 py-1 text-xs">
                    Add
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
