import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EXERCISE_TYPE_LABELS, getVisibleExercise, getVocabularies } from "@/lib/exercises";
import { requireSessionUserId } from "@/lib/auth-session";
import { getUserProfile } from "@/lib/users";
import { listWorkouts } from "@/lib/workouts";
import { DEFAULT_TIME_ZONE } from "@/lib/timezone";
import { DeleteExerciseButton } from "@/components/delete-exercise-button";
import { ExerciseThumbnail, ExerciseVideo } from "@/components/exercise-media";
import { ExerciseStats } from "@/components/exercise-stats";
import { WorkoutHistory } from "@/components/workout-history";

/**
 * The page's sections, in the order the feature describes them. `statistics`
 * leads, so it is the conventional default — how-to now sits last.
 */
const TABS = [
  { id: "statistics", label: "Statistics" },
  { id: "history", label: "History" },
  { id: "how-to", label: "How to" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTabId(value: string | undefined): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

export default async function ExerciseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const exercise = await getVisibleExercise(db, id, userId);
  if (!exercise) notFound();

  // The active tab lives in the URL rather than in client state — the same
  // approach /workouts takes for its exercise filter. A tab is therefore
  // linkable and survives a reload, and the whole page works without JavaScript.
  // An unknown or absent value degrades to the first tab (Statistics) instead
  // of rendering nothing.
  const { tab } = await searchParams;
  const activeTab: TabId = isTabId(tab) ? tab : TABS[0].id;

  const [{ muscles, equipment: equipmentList }, profile] = await Promise.all([
    getVocabularies(db),
    getUserProfile(db, userId),
  ]);
  const timeZone = profile?.timezone ?? DEFAULT_TIME_ZONE;
  const muscleNames = new Map(muscles.map((m) => [m.code, m.display_name]));
  const equipmentNames = new Map(equipmentList.map((e) => [e.code, e.display_name]));
  const secondary = exercise.secondary_muscles.map((code) => muscleNames.get(code) ?? code);
  const isOwner = exercise.is_custom && exercise.owner_id === userId;

  const howTo = exercise.how_to;

  // Only the active tab's data is read, so opening the instructions costs no
  // history or analytics query.
  const history =
    activeTab === "history"
      ? await listWorkouts(db, userId, { exerciseId: exercise.id })
      : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/exercises" className="text-sm text-zinc-500 underline">
        ← Exercises
      </Link>

      <div className="mt-4 flex items-start gap-4">
        <ExerciseThumbnail slug={exercise.slug} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 break-words text-2xl font-semibold">{exercise.title}</h1>
          <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
            {exercise.is_custom ? "Custom exercise" : "Library exercise"}
          </span>
        </div>
      </div>

      {/* The metadata table and the example video share a row — table left,
          player right — and stack below `sm`, where a 256px media column would
          leave the table too narrow to read. The player sits outside the tabs
          so it stays present, and playing, on every one of them. */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start">
        <dl className="min-w-0 flex-1 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex justify-between gap-3 px-4 py-3">
            <dt className="text-sm text-zinc-500">Primary muscle</dt>
            <dd className="min-w-0 break-words text-right text-sm font-medium">{muscleNames.get(exercise.primary_muscle) ?? exercise.primary_muscle}</dd>
          </div>
          {secondary.length > 0 ? (
            <div className="flex justify-between gap-3 px-4 py-3">
              <dt className="text-sm text-zinc-500">Secondary muscles</dt>
              <dd className="min-w-0 break-words text-right text-sm font-medium">{secondary.join(", ")}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 px-4 py-3">
            <dt className="text-sm text-zinc-500">Equipment</dt>
            <dd className="min-w-0 break-words text-right text-sm font-medium">{equipmentNames.get(exercise.equipment) ?? exercise.equipment}</dd>
          </div>
          <div className="flex justify-between gap-3 px-4 py-3">
            <dt className="text-sm text-zinc-500">Type</dt>
            <dd className="min-w-0 break-words text-right text-sm font-medium">{EXERCISE_TYPE_LABELS[exercise.exercise_type]}</dd>
          </div>
        </dl>
        <ExerciseVideo
          slug={exercise.slug}
          mediaUrl={exercise.media_url}
          className="sm:w-64 sm:shrink-0"
        />
      </div>

      {isOwner ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={`/exercises/${exercise.id}/edit`}
            className="flex h-11 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100"
          >
            Edit
          </Link>
          <DeleteExerciseButton id={exercise.id} />
        </div>
      ) : null}

      <nav className="mt-8 flex gap-1 border-b border-zinc-200" aria-label="Exercise sections">
        {TABS.map((t) => {
          const isActive = t.id === activeTab;
          return (
            <Link
              key={t.id}
              href={`/exercises/${exercise.id}?tab=${t.id}`}
              aria-current={isActive ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                isActive
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">
        {activeTab === "how-to" ? (
          howTo ? (
            // Source text with its own numbering and line breaks: preserving
            // them is the whole point, so it must not be reflowed.
            <p className="whitespace-pre-line rounded-xl border border-zinc-200 bg-white p-4 text-sm leading-relaxed shadow-sm">
              {howTo}
            </p>
          ) : (
            <p className="text-zinc-500">No instructions for {exercise.title} yet.</p>
          )
        ) : null}

        {activeTab === "statistics" ? (
          <ExerciseStats
            userId={userId}
            exerciseId={exercise.id}
            exerciseTitle={exercise.title}
            timeZone={timeZone}
          />
        ) : null}

        {activeTab === "history" && history ? (
          history.completed.length === 0 ? (
            <p className="text-zinc-500">No workouts include {exercise.title} yet.</p>
          ) : (
            // The same list /workouts renders, including its cursor-based "Load
            // older" control; it already filters by exercise, which is what this
            // tab wants.
            <WorkoutHistory
              initial={history.completed}
              initialCursor={history.nextCursor}
              exerciseId={exercise.id}
              timeZone={timeZone}
            />
          )
        ) : null}
      </div>
    </main>
  );
}
