"use client";

import { useState, type FormEvent } from "react";

export interface SetFormValues {
  reps: number | null;
  weight_kg: string | null;
  rpe: string | null;
}

/** Trims a form field, treating a blank one as absent rather than as zero. */
function text(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Reads the form's fields under the same rules the write path enforces — a
 * blank field is absent, reps is a whole non-negative number, RPE is 1–10, and
 * weight is a non-negative decimal. The browser's `min`/`max`/`step` constraints
 * already block nearly all of this; validating again here keeps the form's error
 * presentation meaningful instead of being dead markup.
 */
function readValues(form: HTMLFormElement): { values: SetFormValues } | { error: string } {
  const data = new FormData(form);
  const repsRaw = text(data.get("reps"));
  const weightRaw = text(data.get("weight_kg"));
  const rpeRaw = text(data.get("rpe"));

  const reps = repsRaw === null ? null : Number(repsRaw);
  if (reps !== null && (!Number.isInteger(reps) || reps < 0)) {
    return { error: "Reps must be a whole number of zero or more." };
  }

  const rpe = rpeRaw === null ? null : Number(rpeRaw);
  if (rpe !== null && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) {
    return { error: "RPE must be between 1 and 10." };
  }

  if (weightRaw !== null && !/^\d{1,4}(\.\d{1,3})?$/.test(weightRaw)) {
    return { error: "Weight must be a non-negative number." };
  }

  return { values: { reps, weight_kg: weightRaw, rpe: rpeRaw } };
}

/**
 * The per-set entry form. It no longer talks to a server action: the logger owns
 * the workout document and applies the change locally first, so this form only
 * collects the values and hands them over. The callback may return a promise
 * (the logger's local write), which keeps the pending affordance honest.
 */
export function SetForm({
  reps,
  weight,
  rpe,
  onSubmit,
}: {
  reps: number | null;
  weight: string | null;
  rpe: string | null;
  onSubmit: (values: SetFormValues) => void | Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = readValues(event.currentTarget);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSubmit(parsed.values);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-2 gap-2 sm:grid-cols-[5rem_5rem_5rem_auto]"
    >
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
      {error ? (
        <span role="alert" className="col-span-full text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </form>
  );
}
