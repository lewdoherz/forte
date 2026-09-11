"use client";

import type { FormEvent } from "react";

export interface VocabularyEntry {
  code: string;
  display_name: string;
}

export interface ExerciseFilterValues {
  q: string;
  muscle: string;
  equipment: string;
}

export const EMPTY_EXERCISE_FILTERS: ExerciseFilterValues = { q: "", muscle: "", equipment: "" };

/**
 * The exercise search/equipment/muscle filter.
 *
 * Extracted from the Library panel so the routine editor's picker runs the same
 * controls against the same `listExercisesAction`, instead of growing a second
 * filter UI that drifts. It is uncontrolled and reports committed values on
 * submit; the parent keys it on the committed filters so Clear or an external
 * change resets the inputs to them.
 */
export function ExerciseFilterForm({
  muscles,
  equipment,
  values,
  onSubmit,
  onClear,
}: {
  muscles: readonly VocabularyEntry[];
  equipment: readonly VocabularyEntry[];
  values: ExerciseFilterValues;
  onSubmit: (values: ExerciseFilterValues) => void;
  /** Omitted where clearing is not the parent's job (e.g. a plain picker). */
  onClear?: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      q: String(data.get("q") ?? "").trim(),
      muscle: String(data.get("muscle") ?? ""),
      equipment: String(data.get("equipment") ?? ""),
    });
  }

  const hasFilters = Boolean(values.q || values.muscle || values.equipment);

  return (
    <form
      method="get"
      action="/exercises"
      onSubmit={submit}
      className="space-y-2 border-b border-zinc-200 p-4"
    >
      <label className="block">
        <span className="sr-only">Search Exercises</span>
        <input
          name="q"
          type="search"
          defaultValue={values.q}
          placeholder="Search Exercises"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Equipment</span>
          <select
            name="equipment"
            defaultValue={values.equipment}
            className="w-full rounded-md border border-zinc-300 px-2 py-2 text-sm"
          >
            <option value="">All Equipment</option>
            {equipment.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Muscle</span>
          <select
            name="muscle"
            defaultValue={values.muscle}
            className="w-full rounded-md border border-zinc-300 px-2 py-2 text-sm"
          >
            <option value="">All Muscles</option>
            {muscles.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="submit"
          className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium hover:bg-zinc-100"
        >
          Search
        </button>
        {onClear && hasFilters ? (
          <button type="button" onClick={onClear} className="text-xs text-zinc-500 underline">
            Clear
          </button>
        ) : null}
      </div>
    </form>
  );
}
