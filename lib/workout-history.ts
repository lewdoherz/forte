import type { Kysely } from "kysely";
import type { Database } from "./db";
import { summarizeWorkout } from "./workout-stats";
import type { WorkoutPage, WorkoutSummary } from "./workouts";
import type { WorkoutCardData, WorkoutCardExercise } from "@/components/workout-card";

/**
 * The history list's card data.
 *
 * `listWorkouts` already projects a workout to its counts; the card additionally
 * needs the duration, the volume, and the first exercises with their completed
 * set counts. Those are all derived from the rows, so they are loaded in one
 * batch here rather than by widening the summary query with correlated
 * subqueries — and the volume is then folded by `summarizeWorkout`, the same
 * function the logger and the completed detail use, so there is exactly one
 * definition of "volume" in the app.
 */

/** A completed set, as much of it as the card's volume and count need. */
interface CardSet {
  completed_at: Date | null;
  reps: number | null;
  weight_kg: string | null;
}

interface CardExercise {
  title: string;
  slug: string;
  sets: CardSet[];
}

/** One workout's exercises while the flat row stream is folded into them. */
interface WorkoutAccumulator {
  exercises: CardExercise[];
  /** The exercise the last row belonged to, to detect a new exercise block. */
  lastExerciseId: string | null;
}

/**
 * Enriches one page of summaries in a single query. The exercise and set rows
 * are fetched for every listed workout at once, so the cost is one round trip
 * regardless of page size, and the result size is bounded by the page.
 */
export async function enrichWorkoutCards(
  db: Kysely<Database>,
  userId: string,
  summaries: readonly WorkoutSummary[],
): Promise<WorkoutCardData[]> {
  if (summaries.length === 0) return [];

  const rows = await db
    .selectFrom("workout_exercise as we")
    .innerJoin("exercise_template as et", "et.id", "we.template_id")
    .leftJoin("workout_set as ws", "ws.workout_exercise_id", "we.id")
    .select([
      "we.workout_id as workout_id",
      "we.id as workout_exercise_id",
      "et.title as title",
      "et.slug as slug",
      "ws.completed_at as completed_at",
      "ws.reps as reps",
      "ws.weight_kg as weight_kg",
    ])
    .where(
      "we.workout_id",
      "in",
      summaries.map((summary) => summary.id),
    )
    // The same visibility rule `getWorkoutTree` enforces: a template is either
    // global or the caller's own, so this projection cannot see more than the
    // workout page would.
    .where((eb) => eb.or([eb("et.owner_id", "is", null), eb("et.owner_id", "=", userId)]))
    .orderBy("we.position", "asc")
    .orderBy("ws.position", "asc")
    .execute();

  // Rows are ordered by exercise position, so a workout's exercises arrive in
  // order; sets of different workouts interleave, which is why the fold tracks
  // the last exercise per workout rather than assuming adjacency.
  const byWorkout = new Map<string, WorkoutAccumulator>();
  for (const row of rows) {
    let accumulator = byWorkout.get(row.workout_id);
    if (!accumulator) {
      accumulator = { exercises: [], lastExerciseId: null };
      byWorkout.set(row.workout_id, accumulator);
    }
    if (row.workout_exercise_id !== accumulator.lastExerciseId) {
      accumulator.exercises.push({ title: row.title, slug: row.slug, sets: [] });
      accumulator.lastExerciseId = row.workout_exercise_id;
    }
    // Incomplete sets are real rows without a completed_at; they are not part of
    // the record, so they contribute neither to the count nor to the volume.
    if (row.completed_at != null) {
      accumulator.exercises[accumulator.exercises.length - 1].sets.push({
        completed_at: row.completed_at,
        reps: row.reps,
        weight_kg: row.weight_kg,
      });
    }
  }

  return summaries.map((summary) => {
    const exercises = byWorkout.get(summary.id)?.exercises ?? [];
    const stats = summarizeWorkout({
      started_at: summary.started_at,
      ended_at: summary.ended_at,
      exercises,
    });
    const preview: WorkoutCardExercise[] = exercises.map((exercise) => ({
      title: exercise.title,
      slug: exercise.slug,
      completedSets: exercise.sets.length,
    }));
    return {
      id: summary.id,
      title: summary.title,
      started_at: summary.started_at,
      durationSeconds: stats.durationSeconds,
      volumeKg: stats.volumeKg,
      exerciseCount: summary.exercise_count,
      exercises: preview,
    };
  });
}

/** A history page with each workout enriched for its card. */
export interface WorkoutCardPage {
  active: WorkoutCardData[];
  completed: WorkoutCardData[];
  /** Feed back as `cursor` to fetch the next page; null when there is no older workout. */
  nextCursor: string | null;
}

/** Enriches both lists of a history page, preserving the page's ordering. */
export async function enrichWorkoutPage(
  db: Kysely<Database>,
  userId: string,
  page: WorkoutPage,
): Promise<WorkoutCardPage> {
  const [active, completed] = await Promise.all([
    enrichWorkoutCards(db, userId, page.active),
    enrichWorkoutCards(db, userId, page.completed),
  ]);
  return { active, completed, nextCursor: page.nextCursor };
}
