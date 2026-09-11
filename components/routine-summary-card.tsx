"use client";

import { useMemo } from "react";
import { BodyHeatmap } from "@/components/body-heatmap";
import { muscleDistribution, type MuscleExercise } from "@/lib/muscle-distribution";
import { routineSummary, type SummaryExercise } from "@/lib/routine-summary";

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * The compact Summary that sits at the top of the editor's right column.
 *
 * It is a second *view* of the draft, never a second calculation: the counts come
 * from `routineSummary` and the heatmap from `muscleDistribution`, the same two
 * functions `RoutineSummaryPanel` renders in the expanded modal. Both recompute
 * from the unsaved draft each time it changes, so adding or removing an exercise
 * or set moves the card without a save.
 *
 * The whole card opens the expanded modal, which is where the distribution table
 * lives. A wrapping `<button>` cannot hold the card's grid and figures — a button
 * takes phrasing content only — so an absolutely positioned button overlays the
 * content instead; it carries the accessible name, the card carries the label.
 */
export function RoutineSummaryCard({
  exercises,
  onOpen,
}: {
  exercises: readonly (MuscleExercise & SummaryExercise)[];
  onOpen: () => void;
}) {
  const summary = useMemo(() => routineSummary(exercises), [exercises]);
  const distribution = useMemo(() => muscleDistribution(exercises), [exercises]);

  return (
    <div className="group relative rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open routine summary"
        className="absolute inset-0 z-10 rounded-xl group-hover:bg-zinc-50/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      />
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Summary</h2>
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-zinc-500">Exercises</dt>
          <dd className="mt-0.5 text-xl font-semibold tabular-nums">{summary.exerciseCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Total sets</dt>
          <dd className="mt-0.5 text-xl font-semibold tabular-nums">{summary.totalSets}</dd>
        </div>
      </dl>

      {/* Narrower than the modal's heatmap so the card stays compact; the
          component's `w-full` follows this cap down. */}
      <BodyHeatmap muscleValues={distribution.roles} className="mx-auto mt-4 w-full max-w-[13rem]" />
    </div>
  );
}
