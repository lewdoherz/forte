"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function ProgressControls({
  options,
  ranges,
  range,
}: {
  options: { id: string; title: string }[];
  ranges: { value: string; label: string }[];
  range: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function openExercise(exerciseId: string) {
    if (!exerciseId) return;
    const next = new URLSearchParams({ tab: "statistics", range });
    router.push(`/exercises/${exerciseId}?${next.toString()}`);
  }

  function updateRange(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", value);
    next.delete("exercise");
    router.replace(`/progress?${next.toString()}`);
  }

  return (
    <div className="mt-6 flex flex-wrap items-end gap-3">
      <label className="flex min-w-56 flex-1 flex-col gap-1">
        <span className="text-sm font-medium">Exercise</span>
        <select
          value=""
          onChange={(event) => openExercise(event.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Select an exercise…</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Range</span>
        <select
          value={range}
          onChange={(event) => updateRange(event.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          {ranges.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
