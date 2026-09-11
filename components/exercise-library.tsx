"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExerciseThumbnail } from "@/components/exercise-media";
import {
  ExerciseFilterForm,
  type ExerciseFilterValues,
  type VocabularyEntry,
} from "@/components/exercise-filter-form";
import { listExercisesAction } from "@/lib/exercise-actions";
import type { LibraryExercise } from "@/lib/exercise-library";

/**
 * The exercises master-detail shell.
 *
 * It sits in `app/(app)/exercises/layout.tsx` so the Library survives a
 * navigation between `/exercises` and `/exercises/[id]`: a layout is not
 * remounted for a client-side navigation, so the list's scroll position and the
 * filter fields are still there when the reader comes back. Both columns are
 * rendered and toggled with `hidden`, never conditionally, so nothing is
 * unmounted on the route change.
 *
 * Below `sm` the Library is the whole screen on the list route and the detail
 * takes over on a detail route — the same `onListRoute` switch, so the two are
 * never side by side at 320px.
 */
export function ExerciseLibrary({
  children,
  exercises,
  muscles,
  equipment,
}: {
  children: ReactNode;
  exercises: LibraryExercise[];
  muscles: VocabularyEntry[];
  equipment: VocabularyEntry[];
}) {
  const pathname = usePathname();
  const onListRoute = pathname === "/exercises";

  return (
    <div className="mx-auto flex max-w-7xl flex-col sm:flex-row">
      <div className={`min-w-0 flex-1 ${onListRoute ? "hidden sm:block" : "block"}`}>{children}</div>
      <aside
        aria-label="Exercise library"
        className={`w-full border-zinc-200 sm:sticky sm:top-0 sm:flex sm:h-screen sm:w-96 sm:shrink-0 sm:flex-col sm:overflow-hidden sm:border-l ${
          onListRoute ? "block" : "hidden sm:flex"
        }`}
      >
        <ExerciseLibraryPanel
          exercises={exercises}
          muscles={muscles}
          equipment={equipment}
          activeId={activeExerciseId(pathname)}
        />
      </aside>
    </div>
  );
}

/**
 * The id of the exercise whose detail is open, or null.
 *
 * Derived from the pathname rather than passed down: the layout that renders
 * this panel cannot receive the `[id]` segment, and reading the URL keeps the
 * highlight correct without a second source of truth. `/exercises/new` and
 * `/exercises/<id>/edit` deliberately do not match, so no row is highlighted for
 * a route that is not a detail.
 */
function activeExerciseId(pathname: string): string | null {
  const match = /^\/exercises\/([^/]+)$/.exec(pathname);
  return match ? match[1] : null;
}

function ExerciseLibraryPanel({
  exercises: initialExercises,
  muscles,
  equipment,
  activeId,
}: {
  exercises: LibraryExercise[];
  muscles: VocabularyEntry[];
  equipment: VocabularyEntry[];
  activeId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const muscle = searchParams.get("muscle") ?? "";
  const equipmentCode = searchParams.get("equipment") ?? "";

  const [result, setResult] = useState<{ key: string; rows: LibraryExercise[] } | null>(null);
  const [pending, startTransition] = useTransition();

  const filterKey = `${q}|${muscle}|${equipmentCode}`;

  useEffect(() => {
    // The layout already supplied the unfiltered library, so a URL without
    // filters needs no round trip — and an effect that only fires a request
    // when there is one keeps the unfiltered path a pure render.
    if (!q && !muscle && !equipmentCode) return;
    let active = true;
    startTransition(async () => {
      const rows = await listExercisesAction({ q, muscle, equipment: equipmentCode });
      // A response from an earlier filter must not land after a newer one.
      if (active) setResult({ key: filterKey, rows });
    });
    return () => {
      active = false;
    };
  }, [q, muscle, equipmentCode, filterKey]);

  const muscleNames = new Map(muscles.map((entry) => [entry.code, entry.display_name]));
  const hasFilters = Boolean(q || muscle || equipmentCode);
  // A result only counts for the filters currently in the URL. While the one for
  // these filters is outstanding the list shows a loading line rather than the
  // unfiltered catalog, so a filtered URL never briefly renders the wrong rows.
  const filtered = result?.key === filterKey ? result.rows : null;
  const exercises = hasFilters ? filtered : initialExercises;

  // Row links carry the active filters, so opening a detail does not clear the
  // panel's filter. The detail's back link mirrors this.
  const filterQuery = new URLSearchParams();
  if (q) filterQuery.set("q", q);
  if (muscle) filterQuery.set("muscle", muscle);
  if (equipmentCode) filterQuery.set("equipment", equipmentCode);
  const filterSuffix = filterQuery.toString();
  const hrefFor = (id: string) => `/exercises/${id}${filterSuffix ? `?${filterSuffix}` : ""}`;

  function applyFilters(next: ExerciseFilterValues) {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.muscle) params.set("muscle", next.muscle);
    if (next.equipment) params.set("equipment", next.equipment);
    const query = params.toString();
    // `replace` rather than `push`: filters are not a place to walk back
    // through. `scroll: false` keeps the reader where they are.
    router.replace(query ? `/exercises?${query}` : "/exercises", { scroll: false });
  }

  return (
    <div className="flex w-full flex-col sm:h-full sm:min-h-0">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <h2 className="text-sm font-semibold">Library</h2>
        <Link
          href="/exercises/new"
          className="flex h-9 items-center rounded-md bg-zinc-900 px-3 text-xs font-medium text-white"
        >
          + Custom Exercise
        </Link>
      </div>

      <ExerciseFilterForm
        // Keyed on the committed filters so Clear (and any external URL change)
        // resets the uncontrolled inputs to the URL's values.
        key={`${q}|${muscle}|${equipmentCode}`}
        muscles={muscles}
        equipment={equipment}
        values={{ q, muscle, equipment: equipmentCode }}
        onSubmit={applyFilters}
        onClear={() => router.replace("/exercises", { scroll: false })}
      />

      <div className={`sm:min-h-0 sm:flex-1 sm:overflow-y-auto ${pending ? "opacity-60" : ""}`}>
        {exercises === null ? (
          <p className="px-4 py-6 text-sm text-zinc-500">Loading…</p>
        ) : exercises.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">No exercises found.</p>
        ) : (
          <ul>
            {exercises.map((exercise) => {
              const active = exercise.id === activeId;
              return (
                <li key={exercise.id} className="border-b border-zinc-100 last:border-b-0">
                  <Link
                    href={hrefFor(exercise.id)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 px-4 py-2.5 ${
                      active ? "bg-sky-50" : "hover:bg-zinc-50"
                    }`}
                  >
                    {/* Self-removes when artwork is missing; the row keeps its
                        centered layout either way, so rows still align. */}
                    <ExerciseThumbnail slug={exercise.slug} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{exercise.title}</span>
                      <span className="block truncate text-xs text-zinc-500">
                        {muscleNames.get(exercise.primary_muscle) ?? exercise.primary_muscle}
                      </span>
                    </span>
                    {exercise.is_custom ? (
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600">
                        Custom
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
