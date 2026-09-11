import { Kysely, PGliteDialect, PostgresDialect, type Generated } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { join } from "node:path";
import { env } from "./env";
import type {
  Account,
  AppUser,
  Equipment,
  ExerciseTemplate,
  JsonObject,
  MuscleGroup,
  Session,
  SetType,
  Verification,
  WorkoutVisibility,
} from "@/schema/types";

/**
 * Kysely table map. The application and Better Auth share this single Kysely
 * instance. Raw SQL migrations (schema/migrations) remain the authoritative
 * schema; Kysely is the query layer only.
 */
export interface Database {
  // `timezone` (0006_user_timezone.sql) is application-only: it is not part of
  // Better Auth's user model, so it is not on the shared `AppUser` row type.
  app_user: AppUser & { timezone: string };
  session: Session;
  account: Account;
  verification: Verification;
  muscle_group: MuscleGroup;
  equipment: Equipment;
  exercise_template: {
    id: Generated<string>;
    slug: string;
    title: string;
    exercise_type: ExerciseTemplate["exercise_type"];
    primary_muscle: string;
    secondary_muscles: string[];
    equipment: string;
    media_url: string | null;
    // Added by 0010. Declared here as well as on the row type: this map is a
    // separate list, and a column present on only one of the two makes every
    // `selectAll` fail to typecheck.
    how_to: string | null;
    is_custom: boolean;
    owner_id: string | null;
    archived_at: Date | null;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  routine: {
    id: Generated<string>;
    owner_id: string;
    folder_id: string | null;
    title: string;
    notes: string | null;
    position: number;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  routine_exercise: {
    id: Generated<string>;
    routine_id: string;
    template_id: string;
    position: number;
    superset_key: string | null;
    rest_seconds: number | null;
    notes: string | null;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  routine_set: {
    id: Generated<string>;
    routine_exercise_id: string;
    position: number;
    set_type: SetType;
    reps: number | null;
    rep_range_start: number | null;
    rep_range_end: number | null;
    weight_kg: string | null;
    duration_seconds: number | null;
    distance_meters: number | null;
    custom_metric: string | null;
    metrics: Generated<JsonObject>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  workout: {
    id: Generated<string>;
    owner_id: string;
    routine_id: string | null;
    title: string;
    notes: string | null;
    started_at: Date;
    ended_at: Date | null;
    visibility: Generated<WorkoutVisibility>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  workout_exercise: {
    id: Generated<string>;
    workout_id: string;
    template_id: string;
    position: number;
    superset_key: string | null;
    rest_seconds: number | null;
    notes: string | null;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  workout_set: {
    id: Generated<string>;
    workout_exercise_id: string;
    position: number;
    set_type: SetType;
    reps: number | null;
    weight_kg: string | null;
    duration_seconds: number | null;
    distance_meters: number | null;
    rpe: string | null;
    metrics: Generated<JsonObject>;
    completed_at: Date | null;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
}

const globalForDb = globalThis as unknown as { __forteDb?: Kysely<Database> };

function createDb(): Kysely<Database> {
  const connectionString = env.DATABASE_URL;
  if (connectionString) {
    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString }) }),
    });
  }
  // Lazy factory: PGlite loads a WASM binary and must not initialize during
  // Next.js build-time module evaluation (the build worker has no WASM env).
  // It is created on first use, at request time.
  return new Kysely<Database>({
    dialect: new PGliteDialect({ pglite: () => new PGlite(join(process.cwd(), ".pglite")) }),
  });
}

// Reuse one instance across hot reloads so a persistent PGlite data dir is not
// opened twice (Postgres allows a single process per data directory).
export const db: Kysely<Database> =
  globalForDb.__forteDb ?? (globalForDb.__forteDb = createDb());
