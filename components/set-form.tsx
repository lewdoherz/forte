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
    <form
      action={formAction}
      className="grid grid-cols-2 gap-2 sm:grid-cols-[5rem_5rem_5rem_auto]"
    >
      <input type="hidden" name="workoutId" value={workoutId} />
      <input type="hidden" name="setId" value={setId} />
      <input
        type="number"
        name="reps"
        inputMode="numeric"
        min={0}
        defaultValue={reps ?? ""}
        placeholder="reps"
        aria-label="Reps"
        className="h-11 min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
      />
      <input
        type="number"
        name="weight_kg"
        inputMode="decimal"
        min={0}
        step="0.001"
        defaultValue={weight ?? ""}
        placeholder="kg"
        aria-label="Weight in kilograms"
        className="h-11 min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
      />
      <input
        type="number"
        name="rpe"
        inputMode="decimal"
        min={1}
        max={10}
        step="0.5"
        defaultValue={rpe ?? ""}
        placeholder="RPE"
        aria-label="Rate of perceived exertion"
        className="h-11 min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "…" : "Done"}
      </button>
      {state?.error ? (
        <span role="alert" className="col-span-full text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
