"use client";

import { useMemo } from "react";
import { BodyHeatmap } from "@/components/body-heatmap";
import { Modal } from "@/components/modal";
import type { VocabularyEntry } from "@/components/exercise-filter-form";
import { formatDuration } from "@/lib/format";
import { muscleDistribution, type MuscleExercise } from "@/lib/muscle-distribution";
import { routineSummary, type SummaryExercise } from "@/lib/routine-summary";

/**
 * The summary of a routine: metrics, body heatmaps and the distribution table.
 *
 * It is a pure view of the props: every number and layer is recomputed from the
 * exercises each render, with no summary state of its own. That is what lets the
 * editor show an unsaved draft — and the read-only routine page reuse it as-is
 * for a saved prescription, with nothing to persist or invalidate.
 *
 * Two aggregations sit side by side, deliberately: the heatmap is role-weighted
 * (`distribution.roles`) while the table is set-weighted (`distribution.sets`).
 * They come from `lib/muscle-distribution.ts` and must not be merged.
 *
 * `RoutineSummaryBody` is the chrome-free content so a caller can place it in a
 * card; `RoutineSummaryPanel` wraps that same content in the modal the editor
 * opens, so the two cannot drift.
 */
export function RoutineSummaryBody({
  exercises,
  muscles,
}: {
  exercises: readonly (MuscleExercise & SummaryExercise)[];
  /** Muscle vocabulary, in display order; doubles as the code -> name lookup. */
  muscles: readonly VocabularyEntry[];
}) {
  const summary = useMemo(() => routineSummary(exercises), [exercises]);
  const distribution = useMemo(() => muscleDistribution(exercises), [exercises]);

  const rows = useMemo(() => {
    const names: Record<string, string> = {};
    for (const entry of muscles) names[entry.code] = entry.display_name;
    const known = muscles.map((entry) => entry.code);
    // Vocabulary order is the muscle_group sort_order, so the table reads in the
    // reference's order. A code the vocabulary does not know (there should be
    // none) is appended rather than dropped.
    const ordered = [
      ...known.filter((code) => (distribution.sets[code] ?? 0) > 0),
      ...Object.keys(distribution.sets).filter((code) => !known.includes(code)),
    ];
    const max = ordered.reduce((peak, code) => Math.max(peak, distribution.sets[code]), 0);
    return ordered.map((code) => ({
      code,
      label: names[code] ?? code,
      // Sets are multiples of 0.5; show a decimal only when there is one.
      setsLabel: Number.isInteger(distribution.sets[code])
        ? String(distribution.sets[code])
        : distribution.sets[code].toFixed(1),
      // Bar width mirrors the reference: sets relative to the largest muscle.
      percent: max > 0 ? (distribution.sets[code] / max) * 100 : 0,
    }));
  }, [distribution, muscles]);

  return (
    <>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-zinc-200 p-3">
          <dt className="text-xs text-zinc-500">Exercises</dt>
          <dd className="mt-1 text-xl font-semibold">{summary.exerciseCount}</dd>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3">
          <dt className="text-xs text-zinc-500">Total sets</dt>
          <dd className="mt-1 text-xl font-semibold">{summary.totalSets}</dd>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3">
          <dt className="text-xs text-zinc-500">Estimated duration</dt>
          <dd className="mt-1 text-xl font-semibold">
            {summary.totalSets === 0 ? "—" : formatDuration(summary.estimatedDurationSeconds)}
          </dd>
        </div>
      </dl>

      <BodyHeatmap muscleValues={distribution.roles} className="mt-6" />

      <div className="mt-6">
        <h3 className="text-sm font-medium">Muscle distribution</h3>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            Add exercises to see which muscles the routine works.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((row) => (
              <li key={row.code} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-sm">{row.label}</span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <span
                    className="block h-full rounded-full bg-sky-600"
                    style={{ width: `${row.percent}%` }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right text-sm tabular-nums text-zinc-600">
                  {row.setsLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * The editor's Summary dialog: the body above in the shared modal chrome, so
 * the editor keeps its existing open/close contract.
 */
export function RoutineSummaryPanel({
  exercises,
  muscles,
  onClose,
}: {
  exercises: readonly (MuscleExercise & SummaryExercise)[];
  /** Muscle vocabulary, in display order; doubles as the code -> name lookup. */
  muscles: readonly VocabularyEntry[];
  onClose: () => void;
}) {
  return (
    <Modal title="Routine summary" onClose={onClose} panelClassName="max-w-2xl">
      <RoutineSummaryBody exercises={exercises} muscles={muscles} />
    </Modal>
  );
}
