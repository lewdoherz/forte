import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { EXERCISE_TYPE_LABELS, getVisibleExercise, getVocabularies } from "@/lib/exercises";
import { requireSessionUserId } from "@/lib/auth-session";
import { getUserProfile } from "@/lib/users";
import { DEFAULT_TIME_ZONE } from "@/lib/timezone";
import { PROGRESS_RANGES, type ProgressRange } from "@/lib/progress";
import { DeleteExerciseButton } from "@/components/delete-exercise-button";
import { ExerciseThumbnail } from "@/components/exercise-media";
import { ExerciseImage } from "@/components/exercise-image";
import { ExerciseHowTo } from "@/components/exercise-how-to";
import { ExerciseStats } from "@/components/exercise-stats";
import { ExerciseHistory } from "@/components/exercise-history";
import { ExerciseTabs, type ExerciseTab } from "@/components/exercise-tabs";

/**
 * The page's tabs, in display order. How To leads: for a movement the reader
 * usually has not done before, the instructions are the reason they opened it,
 * and the empty state is cheap. The whole list lives in the URL (`?tab=`), so a
 * tab is linkable and a reload lands back on it.
 */
const TABS = [
  { id: "how-to", label: "How to" },
  { id: "statistics", label: "Statistics" },
  { id: "history", label: "History" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTabId(value: string | undefined): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

/** A repeated search param arrives as an array; only a single value is meaningful here. */
function asString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function ExerciseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const exercise = await getVisibleExercise(db, id, userId);
  if (!exercise) notFound();

  // The active tab lives in the URL rather than in client state, so the first
  // paint already shows the right panel — with JavaScript off, and on a fresh
  // deep link alike. An unknown or absent value degrades to How To.
  const query = await searchParams;
  const tabParam = asString(query.tab);
  const activeTab: TabId = isTabId(tabParam) ? tabParam : TABS[0].id;

  // The Statistics tab's range is part of the page URL too, checked against the
  // same PROGRESS_RANGES list /progress validates its own `?range=` with, so the
  // two screens cannot disagree about what a range means. An absent or unknown
  // value falls back to the same "all" the progress page defaults to.
  const rangeParam = asString(query.range);
  const isKnownRange = (PROGRESS_RANGES as readonly string[]).includes(rangeParam ?? "");
  const range: ProgressRange = isKnownRange ? (rangeParam as ProgressRange) : "all";

  // The Library panel's filters ride along on detail URLs, so opening an
  // exercise does not clear the panel's filter; the back link and every tab
  // href carry them for the same reason.
  const filterParams = new URLSearchParams();
  for (const key of ["q", "muscle", "equipment"] as const) {
    const value = asString(query[key]);
    if (value) filterParams.set(key, value);
  }
  const filterQuery = filterParams.toString();
  const backHref = filterQuery ? `/exercises?${filterQuery}` : "/exercises";

  // Tab links additionally carry a range that parsed, so moving between tabs
  // keeps the view the reader chose on the Statistics tab. The Library panel
  // knows nothing about `range`, so it stays off the back link.
  const tabParams = new URLSearchParams(filterParams);
  if (isKnownRange) tabParams.set("range", range);
  const tabHref = (tab: TabId) => {
    const next = new URLSearchParams(tabParams);
    next.set("tab", tab);
    return `/exercises/${exercise.id}?${next.toString()}`;
  };

  const [{ muscles, equipment: equipmentList }, profile] = await Promise.all([
    getVocabularies(db),
    getUserProfile(db, userId),
  ]);
  const timeZone = profile?.timezone ?? DEFAULT_TIME_ZONE;
  const muscleNames = new Map(muscles.map((m) => [m.code, m.display_name]));
  const equipmentNames = new Map(equipmentList.map((e) => [e.code, e.display_name]));
  const secondary = exercise.secondary_muscles.map((code) => muscleNames.get(code) ?? code);
  const isOwner = exercise.is_custom && exercise.owner_id === userId;

  // `media_url` is a video path for the library catalog, but the create/edit
  // dialog writes an image URL there for a custom exercise. The extension is the
  // switch: the image belongs to the stable header, a clip to the How To tab,
  // and neither ever reaches the other's element.
  const mediaIsVideo = exercise.media_url
    ? /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(exercise.media_url)
    : false;
  const headerImage = exercise.media_url && !mediaIsVideo ? exercise.media_url : null;

  // One server-rendered body per tab. ExerciseTabs mounts all of them and
  // toggles visibility, so switching never triggers a navigation — the panels
  // are already there and nothing else on the page is remounted or refetched.
  const panels: Record<TabId, ReactNode> = {
    "how-to": (
      <ExerciseHowTo
        title={exercise.title}
        slug={exercise.slug}
        videoUrl={mediaIsVideo ? exercise.media_url : null}
        howTo={exercise.how_to}
      />
    ),
    statistics: (
      <ExerciseStats
        userId={userId}
        exerciseId={exercise.id}
        exerciseTitle={exercise.title}
        timeZone={timeZone}
        range={range}
      />
    ),
    history: (
      <ExerciseHistory
        userId={userId}
        exerciseId={exercise.id}
        exerciseTitle={exercise.title}
        timeZone={timeZone}
      />
    ),
  };

  const tabs: ExerciseTab[] = TABS.map((tab) => ({
    ...tab,
    href: tabHref(tab.id),
    content: panels[tab.id],
  }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href={backHref} className="text-sm text-zinc-500 underline">
        ← Exercises
      </Link>

      {/* The stable header: identity and catalog metadata, on every tab. The
          instructional clip is deliberately not here — it is tab content. */}
      <header className="mt-4">
        <div className="flex items-start gap-4">
          <ExerciseThumbnail slug={exercise.slug} />
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
            <h1 className="min-w-0 break-words text-2xl font-semibold">{exercise.title}</h1>
            <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
              {exercise.is_custom ? "Custom exercise" : "Library exercise"}
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start">
          <dl className="min-w-0 flex-1 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex justify-between gap-3 px-4 py-3">
              <dt className="text-sm text-zinc-500">Primary muscle</dt>
              <dd className="min-w-0 break-words text-right text-sm font-medium">
                {muscleNames.get(exercise.primary_muscle) ?? exercise.primary_muscle}
              </dd>
            </div>
            {secondary.length > 0 ? (
              <div className="flex justify-between gap-3 px-4 py-3">
                <dt className="text-sm text-zinc-500">Secondary muscles</dt>
                <dd className="min-w-0 break-words text-right text-sm font-medium">
                  {secondary.join(", ")}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 px-4 py-3">
              <dt className="text-sm text-zinc-500">Equipment</dt>
              <dd className="min-w-0 break-words text-right text-sm font-medium">
                {equipmentNames.get(exercise.equipment) ?? exercise.equipment}
              </dd>
            </div>
            <div className="flex justify-between gap-3 px-4 py-3">
              <dt className="text-sm text-zinc-500">Type</dt>
              <dd className="min-w-0 break-words text-right text-sm font-medium">
                {EXERCISE_TYPE_LABELS[exercise.exercise_type]}
              </dd>
            </div>
          </dl>
          {headerImage ? (
            <ExerciseImage
              src={headerImage}
              alt={exercise.title}
              className="sm:w-64 sm:shrink-0"
            />
          ) : null}
        </div>
      </header>

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

      <ExerciseTabs tabs={tabs} activeId={activeTab} />
    </main>
  );
}
