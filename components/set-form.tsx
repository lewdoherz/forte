"use client";

import { useActionState } from "react";
import { logSetFormAction } from "@/lib/workout-actions";

export function SetForm({
  workoutId,
  setId,
  reps,
  weight,
  rpe,
}: {
  workoutId: string;
  setId: string;
  reps: number | null;
  weight: string | null;
  rpe: string | null;
}) {
  const [state, formAction, pending] = useActionState(logSetFormAction, null);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="workoutId" value={workoutId} />
      <input type="hidden" name="setId" value={setId} />
      <input
        type="number"
        name="reps"
        min={0}
        defaultValue={reps ?? ""}
        placeholder="reps"
        className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
      />
      <input
        type="number"
        name="weight_kg"
        min={0}
        step="0.001"
        defaultValue={weight ?? ""}
        placeholder="kg"
        className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
      />
      <input
        type="number"
        name="rpe"
        min={1}
        max={10}
        step="0.5"
        defaultValue={rpe ?? ""}
        placeholder="RPE"
        className="w-16 rounded border border-zinc-300 px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
      >
        {pending ? "…" : "Done"}
      </button>
      {state?.error ? (
        <span role="alert" className="w-full text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
