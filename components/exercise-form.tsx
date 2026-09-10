"use client";

import { useActionState } from "react";
import type { ExerciseType } from "@/schema/types";
import { EXERCISE_TYPE_LABELS } from "@/lib/exercises";
import type { ExerciseActionState } from "@/lib/exercise-actions";

type FormAction = (
  prev: ExerciseActionState | null,
  formData: FormData,
) => Promise<ExerciseActionState>;

interface ExerciseFormProps {
  action: FormAction;
  muscles: { code: string; display_name: string }[];
  equipment: { code: string; display_name: string }[];
  submitLabel: string;
  initial?: {
    title: string;
    exercise_type: ExerciseType;
    primary_muscle: string;
    secondary_muscles: string[];
    equipment: string;
  };
}

export function ExerciseForm({ action, muscles, equipment, submitLabel, initial }: ExerciseFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const selectedSecondary = new Set(initial?.secondary_muscles ?? []);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state?.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">Name</span>
        <input
          name="title"
          defaultValue={initial?.title}
          required
          maxLength={120}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Primary muscle</span>
        <select
          name="primary_muscle"
          defaultValue={initial?.primary_muscle ?? ""}
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Select a muscle
          </option>
          {muscles.map((m) => (
            <option key={m.code} value={m.code}>
              {m.display_name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Secondary muscles (optional)</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-zinc-300 p-3 sm:grid-cols-3">
          {muscles.map((m) => (
            <label key={m.code} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="secondary_muscles"
                value={m.code}
                defaultChecked={selectedSecondary.has(m.code)}
              />
              {m.display_name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Equipment</span>
        <select
          name="equipment"
          defaultValue={initial?.equipment ?? ""}
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Select equipment
          </option>
          {equipment.map((e) => (
            <option key={e.code} value={e.code}>
              {e.display_name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Type</span>
        <select
          name="exercise_type"
          defaultValue={initial?.exercise_type ?? "weight_reps"}
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          {(Object.keys(EXERCISE_TYPE_LABELS) as ExerciseType[]).map((t) => (
            <option key={t} value={t}>
              {EXERCISE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
