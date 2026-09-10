import type { Kysely } from "kysely";
import type { Database } from "./db";
import type { RoutineTree, WorkoutTree } from "@/schema/types";
import { getRoutineTree, listRoutines } from "./routines";
import { getWorkoutTree } from "./workouts";
import { getUserProfile } from "./users";

/**
 * Everything the account owns, in one document.
 *
 * Assembled from the same owner-scoped helpers the application itself uses
 * rather than hand-written joins: each filters on `owner_id`, so the export
 * cannot reach another account's rows. Ownership is the one property this file
 * must never get wrong, and reusing the queries that already prove it is more
 * reliable than restating the predicate here.
 *
 * Deliberately not batched. An export is rare and user-initiated, and the row
 * count is bounded by one person's training history.
 */
export async function gatherAccountExport(db: Kysely<Database>, userId: string) {
  const profile = await getUserProfile(db, userId);

  const routines: RoutineTree[] = [];
  for (const row of await listRoutines(db, userId)) {
    const tree = await getRoutineTree(db, row.id, userId);
    if (tree) routines.push(tree);
  }

  // Deliberately not listWorkouts: that query is bounded by the history view's
  // page limit, so an export built on it would silently drop older training —
  // worse than having no export. An export has to be complete to be worth
  // anything.
  const workoutIds = await db
    .selectFrom("workout")
    .select("id")
    .where("owner_id", "=", userId)
    .orderBy("started_at", "asc")
    .execute();

  const workouts: WorkoutTree[] = [];
  for (const row of workoutIds) {
    const tree = await getWorkoutTree(db, row.id, userId);
    if (tree) workouts.push(tree);
  }

  // Only the user's own additions; the global catalog is not theirs to export.
  const customExercises = await db
    .selectFrom("exercise_template")
    .selectAll()
    .where("owner_id", "=", userId)
    .orderBy("title", "asc")
    .execute();

  return {
    exportedAt: new Date().toISOString(),
    account: profile ?? null,
    customExercises,
    routines,
    workouts,
  };
}
