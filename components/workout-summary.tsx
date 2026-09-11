import { BodyHeatmap } from "@/components/body-heatmap";
import type { VocabularyEntry } from "@/components/exercise-filter-form";
import { muscleDistribution, type MuscleExercise } from "@/lib/muscle-distribution";

/**
 * The muscle work of a completed workout.
 *
 * It renders the same two things the routine summary does — the role-weighted
 * front/back heatmap and the set-weighted distribution table — through the same
 * code: `muscleDistribution` decides both aggregations and `BodyHeatmap` owns
 * the intensity normalisation (`weight / max`). Nothing about the distribution
 * is recalculated here, and this component takes the exercise shape those two
 * already accept, which is exactly why `lib/muscle-distribution.ts` was written
 * without a routine in hand: a completed workout supplies its own exercises.
 *
 * It is deliberately not `RoutineSummaryBody`. That body's metric tiles are a
 * routine's plan — exercise count, working sets, ESTIMATED duration — and the
 * completed workout already reports its own duration and volume in the header,
 * so an estimate beside them would state a number the record does not contain.
 * Only the section's framing is workout-specific; the distribution itself is
 * shared.
 *
 * `exercises` must carry only the sets that were actually completed: an
 * incomplete set is not part of the record. `lib/muscle-distribution.ts` then
 * excludes warm-ups from both aggregations, exactly as it does for a routine.
 */
export function WorkoutSummary({
  exercises,
  muscles,
}: {
  exercises: readonly MuscleExercise[];
  /** Muscle vocabulary, in display order; doubles as the code -> name lookup. */
  muscles: readonly VocabularyEntry[];
}) {
  const distribution = muscleDistribution(exercises);

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
  const rows = ordered.map((code) => ({
    code,
    label: names[code] ?? code,
    // Sets are multiples of 0.5; show a decimal only when there is one.
    setsLabel: Number.isInteger(distribution.sets[code])
      ? String(distribution.sets[code])
      : distribution.sets[code].toFixed(1),
    // Bar width mirrors the reference: sets relative to the largest muscle.
    percent: max > 0 ? (distribution.sets[code] / max) * 100 : 0,
  }));

  return (
    <>
      <BodyHeatmap muscleValues={distribution.roles} className="mt-4" />

      <div className="mt-6">
        <h3 className="text-sm font-medium">Muscle distribution</h3>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No working sets to show muscles for.
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
