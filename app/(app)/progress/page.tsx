import { Suspense } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getVisibleExercise, listExercises } from "@/lib/exercises";
import { requireSessionUserId } from "@/lib/auth-session";
import {
  PROGRESS_RANGES,
  RANGE_LABELS,
  progressQuerySchema,
  type ProgressRange,
} from "@/lib/progress";
import { ProgressControls } from "@/components/progress-controls";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Progress is the exercise picker for the canonical Statistics view. Existing
 * `/progress?exercise=…&range=…` links redirect to that view, so bookmarks keep
 * working without preserving a second analytics implementation.
 */
export default async function ProgressPage({ searchParams }: { searchParams: SearchParams }) {
  const userId = await requireSessionUserId();
  const params = await searchParams;
  const exerciseParam = typeof params.exercise === "string" ? params.exercise : "";
  const rangeParam = typeof params.range === "string" ? params.range : "all";
  const range: ProgressRange = (PROGRESS_RANGES as readonly string[]).includes(rangeParam)
    ? (rangeParam as ProgressRange)
    : "all";

  if (exerciseParam) {
    const parsed = progressQuerySchema.safeParse({ templateId: exerciseParam, range });
    if (parsed.success) {
      const exercise = await getVisibleExercise(db, parsed.data.templateId, userId);
      if (exercise) {
        redirect(`/exercises/${exercise.id}?tab=statistics&range=${range}`);
      }
    }
  }

  const exercises = await listExercises(db, userId, {});
  const options = exercises.map((exercise) => ({ id: exercise.id, title: exercise.title }));
  const ranges = PROGRESS_RANGES.map((option) => ({
    value: option,
    label: RANGE_LABELS[option],
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Progress</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-500">
        Choose an exercise to view its statistics, progression, and personal records. Results
        come from completed sets in finished workouts.
      </p>

      <Suspense fallback={null}>
        <ProgressControls options={options} ranges={ranges} range={range} />
      </Suspense>

      {options.length === 0 ? (
        <p className="mt-8 text-zinc-500">No exercises available.</p>
      ) : (
        <p className="mt-8 text-sm text-zinc-500">
          Exercise statistics use type-specific metrics, so a run, hold, and weighted exercise
          are never compared using the same generic summary.
        </p>
      )}
    </main>
  );
}
