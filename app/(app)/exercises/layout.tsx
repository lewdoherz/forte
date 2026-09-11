import { Suspense, type ReactNode } from "react";
import { db } from "@/lib/db";
import { getVocabularies, listExercises } from "@/lib/exercises";
import { toLibraryExercise } from "@/lib/exercise-library";
import { requireSessionUserId } from "@/lib/auth-session";
import { ExerciseLibrary } from "@/components/exercise-library";

/**
 * The exercises master-detail shell.
 *
 * It wraps both `/exercises` and `/exercises/[id]` so the Library panel is
 * rendered once and is not remounted as the reader moves between them. The
 * filtered list itself is fetched by the panel's server action, because a layout
 * does not receive `searchParams`; the whole visible catalog is read here so the
 * unfiltered first paint needs no round trip.
 *
 * `modal` is the parallel-route slot that renders the create/edit dialog over
 * the current page (see `@modal/(.)new` and `@modal/(.)[id]/edit`).
 */
export default async function ExercisesLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  const userId = await requireSessionUserId();
  const [rows, { muscles, equipment }] = await Promise.all([
    listExercises(db, userId),
    getVocabularies(db),
  ]);

  return (
    <>
      {/* The panel reads the URL through `useSearchParams`, which suspends while
          a statically prerendered page is being built. This route is dynamic
          (it depends on the session), but the boundary keeps that guaranteed. */}
      <Suspense fallback={null}>
        <ExerciseLibrary
          exercises={rows.map(toLibraryExercise)}
          muscles={muscles}
          equipment={equipment}
        >
          {children}
        </ExerciseLibrary>
      </Suspense>
      {modal}
    </>
  );
}
