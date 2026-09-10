/**
 * Development seed — OPT-IN ONLY.
 *
 *   bun run db:seed:dev
 *
 * Creates a demo account with realistic data so the app can be exercised without
 * hand-entering months of training. Nothing invokes this automatically: not
 * `db:migrate`, not `dev`, not `build`, and not CI's verification job (which
 * runs it only to prove it still works).
 *
 * Two properties make it safe to re-run:
 *   - it refuses to touch anything that is not a local database, because the
 *     account it creates has a known password;
 *   - it deletes and recreates the demo user, so every run yields the same
 *     dataset rather than accumulating duplicates.
 *
 * All data is written through the application's own `lib/` functions, so every
 * ownership check, snapshot rule and completion rule is exercised. The only
 * direct SQL is backdating timestamps — see `backdateSession` — which exists
 * purely so the history spans months instead of all landing in this minute.
 */
import { createAuth } from "../lib/auth";
import { db } from "../lib/db";
import { env } from "../lib/env";
import { createCustomExercise, listExercises } from "../lib/exercises";
import { log } from "../lib/log";
import { createRoutine } from "../lib/routines";
import { updateUserProfile } from "../lib/users";
import { finishWorkout, getWorkoutTree, logSet, startWorkout } from "../lib/workouts";

const DEMO_EMAIL = "demo@forte.local";
const DEMO_PASSWORD = "forte-demo-password";
const DEMO_NAME = "Demo Athlete";
const DEMO_TIMEZONE = "America/Chicago";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Returns a human-readable description of the target, or throws. The connection
 * string itself is never printed — it carries credentials.
 */
function assertLocalTarget(): string {
  const url = env.DATABASE_URL;
  if (!url) return "pglite (.pglite/)";

  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to seed: DATABASE_URL points at "${host}", which is not local.\n` +
        "This script creates an account with a known password and is for local development only.",
    );
  }
  return `postgres (${host})`;
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

async function resetDemoUser(): Promise<boolean> {
  const existing = await db
    .selectFrom("app_user")
    .select("id")
    .where("email", "=", DEMO_EMAIL)
    .executeTakeFirst();
  if (!existing) return false;

  // Sessions, accounts, routines, workouts and custom exercises all cascade from
  // app_user, so this single delete is a complete reset.
  await db.deleteFrom("app_user").where("id", "=", existing.id).execute();
  return true;
}

async function main(): Promise<void> {
  const target = assertLocalTarget();
  console.log(`seeding ${target}`);

  const reset = await resetDemoUser();
  if (reset) console.log(`removed the previous ${DEMO_EMAIL} account`);

  // Sign up through Better Auth so the demo account has a real credential hash
  // and is genuinely able to sign in.
  const auth = createAuth(db);
  const { user } = await auth.api.signUpEmail({
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: DEMO_NAME },
  });
  await updateUserProfile(db, user.id, { timeZone: DEMO_TIMEZONE });

  // ---- catalog ------------------------------------------------------------
  const catalog = await listExercises(db, user.id, {});
  const byTitle = new Map(catalog.map((e) => [e.title, e]));
  const need = (title: string) => {
    const found = byTitle.get(title);
    if (!found) throw new Error(`system exercise "${title}" is missing from the seed`);
    return found;
  };

  // Custom exercises use titles that are deliberately NOT in the system catalog,
  // so the library never shows two entries with the same name. Their muscle and
  // equipment are inherited from a related system row rather than hard-coded
  // vocabulary codes.
  const customs = [
    await createCustomExercise(db, user.id, {
      title: "Seated Cable Row",
      exercise_type: "weight_reps",
      primary_muscle: need("Barbell Row").primary_muscle,
      secondary_muscles: [],
      equipment: need("Cable Fly").equipment,
    }),
    await createCustomExercise(db, user.id, {
      title: "Bulgarian Split Squat",
      exercise_type: "weight_reps",
      primary_muscle: need("Barbell Back Squat").primary_muscle,
      secondary_muscles: [],
      equipment: need("Goblet Squat").equipment,
    }),
  ];
  // The catalog was read before these existed, so make them resolvable by title.
  for (const custom of customs) byTitle.set(custom.title, custom);

  // ---- routines -----------------------------------------------------------
  // Progressive overload so /progress has a real trend to draw.
  const routines = [
    {
      title: "Push Day",
      notes: "Chest, shoulders, triceps.",
      exercises: [
        { title: "Bench Press", rest: 150, sets: [8, 8, 6] },
        { title: "Overhead Press", rest: 120, sets: [8, 8] },
        { title: "Incline Dumbbell Press", rest: 90, sets: [10, 10] },
      ],
    },
    {
      title: "Pull Day",
      notes: "Back and biceps.",
      exercises: [
        { title: "Barbell Row", rest: 150, sets: [8, 8, 6] },
        { title: "Romanian Deadlift", rest: 150, sets: [8, 8] },
        { title: "Face Pull", rest: 60, sets: [15, 15] },
      ],
    },
    {
      title: "Leg Day",
      notes: "Squat focus.",
      exercises: [
        { title: "Barbell Back Squat", rest: 180, sets: [6, 6, 5] },
        { title: "Bulgarian Split Squat", rest: 90, sets: [10, 10] },
        { title: "Leg Press", rest: 120, sets: [10, 10] },
      ],
    },
  ];

  const plans: { title: string; id: string }[] = [];
  for (const routine of routines) {
    const plan = await createRoutine(db, user.id, {
      title: routine.title,
      notes: routine.notes,
      exercises: routine.exercises.map((ex) => ({
        template_id: need(ex.title).id,
        rest_seconds: ex.rest,
        notes: null,
        sets: ex.sets.map((reps) => ({ set_type: "normal" as const, reps, weight_kg: null })),
      })),
    });
    plans.push({ title: routine.title, id: plan.id });
  }

  // ---- history ------------------------------------------------------------
  const SESSIONS_PER_ROUTINE = 5;
  const STARTING_WEIGHT: Record<string, number> = {
    "Bench Press": 60,
    "Overhead Press": 35,
    "Incline Dumbbell Press": 22.5,
    "Barbell Row": 50,
    "Romanian Deadlift": 70,
    "Face Pull": 20,
    "Barbell Back Squat": 80,
    "Bulgarian Split Squat": 16,
    "Leg Press": 120,
  };

  let sessions = 0;
  let sets = 0;

  for (const [routineIndex, routine] of plans.entries()) {
    for (let session = 0; session < SESSIONS_PER_ROUTINE; session++) {
      // Oldest first, one session every 9 days per routine, routines offset so
      // the three interleave through the calendar.
      const daysBack = (SESSIONS_PER_ROUTINE - 1 - session) * 9 + routineIndex * 3;
      const startedAt = daysAgo(daysBack);

      const workout = await startWorkout(db, user.id, routine.id);
      const tree = await getWorkoutTree(db, workout.id, user.id);
      if (!tree) throw new Error("workout tree missing right after start");

      await db
        .updateTable("workout")
        .set({ started_at: startedAt })
        .where("id", "=", workout.id)
        .execute();

      for (const exercise of tree.exercises) {
        const base = STARTING_WEIGHT[exercise.template.title] ?? 40;
        const planned = exercise.sets;

        for (const [index, set] of planned.entries()) {
          // Leave the last set unlogged every third session: incomplete sets are
          // legitimate and exercise the "incomplete sets are excluded" rule.
          if (index === planned.length - 1 && session % 3 === 2) continue;

          const reps = Math.max(3, (set.reps ?? 8) - (index % 2));
          await logSet(db, user.id, {
            setId: set.id,
            reps,
            weight_kg: (base + session * 2.5).toFixed(1),
            rpe: (7 + (index % 3) * 0.5).toFixed(1),
          });
          sets++;
        }
      }

      await finishWorkout(db, user.id, workout.id);
      await backdateSession(workout.id, startedAt);
      sessions++;
    }
  }

  // ---- one workout left in progress ---------------------------------------
  const active = await startWorkout(db, user.id, plans[0].id);
  const activeTree = await getWorkoutTree(db, active.id, user.id);
  if (activeTree?.exercises[0]) {
    await logSet(db, user.id, {
      setId: activeTree.exercises[0].sets[0].id,
      reps: 10,
      weight_kg: "62.5",
      rpe: "7",
    });
  }

  log.info("seed.completed", { email: DEMO_EMAIL, sessions, sets, target, reset });

  console.log(`\n  ${sessions} completed workouts, ${sets} logged sets`);
  console.log("  plus one workout left in progress\n");
  console.log("  sign in with:");
  console.log(`    email    ${DEMO_EMAIL}`);
  console.log(`    password ${DEMO_PASSWORD}\n`);
}

/**
 * A completed session should look like it happened weeks ago, not this second.
 * `finishWorkout` stamps `ended_at` from the clock, so it is corrected here to a
 * plausible 55-minute session. This is the only direct SQL in the script.
 */
async function backdateSession(workoutId: string, startedAt: Date): Promise<void> {
  await db
    .updateTable("workout")
    .set({ ended_at: new Date(startedAt.getTime() + 55 * 60 * 1000) })
    .where("id", "=", workoutId)
    .execute();
}

await main();
await db.destroy();
