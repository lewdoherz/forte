"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RoutineTree, SetType } from "@/schema/types";
import { SET_TYPES } from "@/schema/types";
import { saveRoutine } from "@/lib/routine-actions";

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: "Warm-up",
  normal: "Normal",
  failure: "Failure",
  dropset: "Drop set",
};

type SetDraft = { set_type: SetType; reps: string; weight_kg: string };
type ExerciseDraft = { template_id: string; rest_seconds: string; notes: string; sets: SetDraft[] };

interface RoutineEditorProps {
  library: { id: string; title: string; primary_muscle: string }[];
  initial?: RoutineTree;
}

export function RoutineEditor({ library, initial }: RoutineEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [exercises, setExercises] = useState<ExerciseDraft[]>(() =>
    (initial?.exercises ?? []).map((e) => ({
      template_id: e.template_id,
      rest_seconds: e.rest_seconds?.toString() ?? "",
      notes: e.notes ?? "",
      sets: e.sets.map((s) => ({
        set_type: s.set_type,
        reps: s.reps?.toString() ?? "",
        weight_kg: s.weight_kg ?? "",
      })),
    })),
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const titleById = new Map(library.map((e) => [e.id, e.title]));
  const addedIds = new Set(exercises.map((e) => e.template_id));
  const results = library.filter(
    (e) => !addedIds.has(e.id) && e.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function addExercise(id: string) {
    if (addedIds.has(id)) return;
    setExercises((prev) => [
      ...prev,
      { template_id: id, rest_seconds: "", notes: "", sets: [{ set_type: "normal", reps: "", weight_kg: "" }] },
    ]);
    setQuery("");
  }

  function removeExercise(index: number) {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  }

  function moveExercise(index: number, dir: -1 | 1) {
    setExercises((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
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

  function addSet(exIndex: number) {
    setExercises((prev) =>
      prev.map((e, i) =>
        i === exIndex ? { ...e, sets: [...e.sets, { set_type: "normal", reps: "", weight_kg: "" }] } : e,
      ),
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
        rest_seconds: ex.rest_seconds.trim() === "" ? null : Number(ex.rest_seconds),
        notes: ex.notes.trim() || null,
        sets: ex.sets.map((s) => ({
          set_type: s.set_type,
          reps: s.reps.trim() === "" ? null : Number(s.reps),
          weight_kg: s.weight_kg.trim() || null,
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
    <div className="mt-6 space-y-6">
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

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
          <p className="mt-2 text-sm text-zinc-500">Add an exercise below to get started.</p>
        ) : (
          <ol className="mt-2 space-y-3">
            {exercises.map((ex, i) => (
              <li key={`${ex.template_id}-${i}`} className="rounded-lg border border-zinc-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{i + 1}. {titleById.get(ex.template_id) ?? "Exercise"}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveExercise(i, -1)} disabled={i === 0} className="rounded border px-2 py-0.5 text-sm disabled:opacity-40">↑</button>
                    <button type="button" onClick={() => moveExercise(i, 1)} disabled={i === exercises.length - 1} className="rounded border px-2 py-0.5 text-sm disabled:opacity-40">↓</button>
                    <button type="button" onClick={() => removeExercise(i)} className="rounded border border-red-200 px-2 py-0.5 text-sm text-red-700">✕</button>
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
                        className="rounded border border-zinc-300 px-2 py-1"
                      >
                        {SET_TYPES.map((t) => (
                          <option key={t} value={t}>{SET_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        placeholder="reps"
                        value={s.reps}
                        onChange={(e) => patchSet(i, j, { reps: e.target.value })}
                        className="w-20 rounded border border-zinc-300 px-2 py-1"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        placeholder="kg"
                        value={s.weight_kg}
                        onChange={(e) => patchSet(i, j, { weight_kg: e.target.value })}
                        className="w-20 rounded border border-zinc-300 px-2 py-1"
                      />
                      <button type="button" onClick={() => removeSet(i, j)} className="text-xs text-red-600">remove</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addSet(i)} className="text-xs text-zinc-600 underline">
                    + Add set
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium">Add exercise</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises…"
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        {query.trim() !== "" && results.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No matching exercises.</p>
        ) : (
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border border-zinc-200 p-2">
            {results.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm">
                <span>{e.title}</span>
                <button
                  type="button"
                  onClick={() => addExercise(e.id)}
                  className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Create routine"}
        </button>
      </div>
    </div>
  );
}
