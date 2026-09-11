import Link from "next/link";
import { ExerciseThumbnail } from "@/components/exercise-media";
import { formatDuration } from "@/lib/format";
import { formatDateTimeInTimeZone } from "@/lib/timezone";
import { formatVolumeKg } from "@/lib/workout-stats";

/** One exercise as a history card previews it. */
export interface WorkoutCardExercise {
  title: string;
  slug: string;
  /** Completed sets only; an incomplete set is not part of the record. */
  completedSets: number;
}

/**
 * A workout as the history list renders it.
 *
 * `exercises` is the whole workout in order; the card itself decides how many
 * to preview, so the "See N more" count is derived from the same list the
 * preview is drawn from rather than a second server-side count.
 */
export interface WorkoutCardData {
  id: string;
  title: string;
  started_at: Date;
  durationSeconds: number;
  volumeKg: number;
  exerciseCount: number;
  /**
   * The earned records in this workout: distinct (exercise, category) pairs
   * whose best candidate strictly beat the pre-workout baseline. `null` when
   * the count was not calculated — an in-progress workout has no finished
   * performance to judge — so the card omits the metric rather than showing a
   * zero it did not verify.
   */
  recordCount: number | null;
  exercises: WorkoutCardExercise[];
}

/** How many exercises a card previews before summarising the rest. */
const PREVIEW_EXERCISES = 3;

function setCountLabel(count: number): string {
  return `${count} ${count === 1 ? "set" : "sets"}`;
}

/**
 * One workout in the history list. The whole card is the link, which is the
 * list's existing convention — so `See N more exercises` navigates to the
 * workout rather than expanding the card in place. Expanding would need a
 * nested control inside this anchor, and a separate control inside a link is
 * invalid markup; keeping it as text also keeps the card a single tap target.
 *
 * It renders no individual sets: the card stays compact and scannable, and the
 * per-set record lives on the workout's own page.
 */
export function WorkoutCard({
  card,
  timeZone,
  active = false,
}: {
  card: WorkoutCardData;
  /** The owner's zone, so the card reads the same on the server and in the browser. */
  timeZone: string;
  /** An in-progress workout: the card links back into the logger. */
  active?: boolean;
}) {
  const preview = card.exercises.slice(0, PREVIEW_EXERCISES);
  const remaining = Math.max(0, card.exerciseCount - preview.length);

  return (
    <Link
      href={`/workouts/${card.id}`}
      className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-400"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 break-words font-medium">{card.title}</span>
        <span className="shrink-0 text-xs text-zinc-500">
          {formatDateTimeInTimeZone(card.started_at, timeZone)}
        </span>
      </div>
      {active ? (
        <div className="mt-0.5 text-xs font-medium text-amber-700">In progress</div>
      ) : null}

      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-zinc-500">Duration</dt>
          <dd className="font-medium tabular-nums">{formatDuration(card.durationSeconds)}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-zinc-500">Volume</dt>
          <dd className="font-medium tabular-nums">{formatVolumeKg(card.volumeKg)}</dd>
        </div>
        {/* Omitted, not zeroed, when the count is unavailable: an in-progress
            workout has no record yet, and a fabricated "0" would read as a
            checked-and-empty result. A verified zero renders as a plain 0; the
            medal marks the workouts that actually earned something. */}
        {card.recordCount === null ? null : (
          <div className="flex items-baseline gap-1.5">
            <dt className="text-zinc-500">Records</dt>
            <dd className="font-medium tabular-nums">
              {card.recordCount > 0 ? `🏅 ${card.recordCount}` : "0"}
            </dd>
          </div>
        )}
      </dl>

      {preview.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {preview.map((exercise, index) => (
            <li key={`${exercise.slug}-${index}`} className="flex items-center gap-2.5">
              {/* Fixed box so the row keeps its height whether or not the
                  thumbnail loads: ExerciseThumbnail removes itself on a missing
                  file, which would otherwise collapse the row after hydration. */}
              <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                <ExerciseThumbnail slug={exercise.slug} size="sm" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{exercise.title}</span>
              <span className="shrink-0 text-xs text-zinc-500">
                {setCountLabel(exercise.completedSets)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {remaining > 0 ? (
        <div className="mt-2 text-sm text-zinc-500">
          See {remaining} more {remaining === 1 ? "exercise" : "exercises"}
        </div>
      ) : null}
    </Link>
  );
}
