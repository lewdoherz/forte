/**
 * types.ts — TypeScript row types for the migration in migrations/0001_init.sql
 *
 * These types describe what a raw SQL driver returns, column for column. They are
 * deliberately snake_case, because that is what `pg` / PGlite / most ORMs hand back
 * for these tables; there is no mapping layer to keep in sync. If you adopt an ORM
 * with a camelCase model layer, generate the model types from it instead and keep
 * these as the raw boundary types.
 *
 * Type mapping (default parsers, see the driver note at the bottom):
 *   uuid, text, enum  -> string
 *   integer           -> number
 *   numeric           -> string   <-- precision-preserving, NOT number
 *   timestamptz       -> Date
 *   text[]            -> string[]
 *   jsonb             -> JsonObject
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Uuid = string;

/** jsonb columns. Narrow at the call site, or extend the specific interface. */
export type JsonObject = { [key: string]: unknown };

// ---------------------------------------------------------------------------
// Enumerations — must stay in step with the pg enums in 0001_init.sql.
// The arrays give you a runtime source of truth for form options / validation.
// ---------------------------------------------------------------------------

export const SET_TYPES = ['warmup', 'normal', 'failure', 'dropset'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const WORKOUT_VISIBILITIES = ['public', 'followers', 'private'] as const;
export type WorkoutVisibility = (typeof WORKOUT_VISIBILITIES)[number];

export const EXERCISE_TYPES = [
  'weight_reps',
  'bodyweight_reps',
  'bodyweight_weighted',
  'bodyweight_assisted',
  'reps_only',
  'duration',
  'weight_duration',
  'distance_duration',
  'short_distance_weight',
  'floors_duration',
  'steps_duration',
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

// ---------------------------------------------------------------------------
// Column-type helpers
// ---------------------------------------------------------------------------

/** A numeric column as returned by the driver (string), or null when nullable. */
export type Numeric = string;

/** Columns every timestamped table has. */
export interface Timestamped {
  id: Uuid;
  created_at: Date;
  updated_at: Date;
}

/** Minimal shape of an insertable row: a generated id and a created_at stamp. */
export interface Created {
  id: Uuid;
  created_at: Date;
}

/**
 * Shape accepted by an INSERT. Generated columns (id, created_at, updated_at) are
 * removed; columns with a database default or a nullable type can be listed in
 * `OptionalKeys` to become optional. Tables without updated_at simply do not
 * declare that column, and Omit ignores the extra key.
 */
export type New<T extends Created, OptionalKeys extends keyof T = never> = Omit<
  T,
  'id' | 'created_at' | 'updated_at' | OptionalKeys
> &
  Partial<Pick<T, OptionalKeys>>;

/** Shape accepted by an UPDATE: everything mutable, all optional. */
export type Patch<T extends Created> = Partial<
  Omit<T, 'id' | 'created_at' | 'updated_at'>
>;

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

export interface MuscleGroup {
  code: string;
  display_name: string;
  sort_order: number;
}

export interface Equipment {
  code: string;
  display_name: string;
  sort_order: number;
}

export type NewMuscleGroup = Omit<MuscleGroup, 'sort_order'> & { sort_order?: number };
export type NewEquipment = Omit<Equipment, 'sort_order'> & { sort_order?: number };

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface AppUser extends Timestamped {
  username: string | null;
  email: string;
  display_name: string | null;
  bio: string | null;
  link: string | null;
  profile_pic_url: string | null;
  email_verified: boolean;
  private_profile: boolean;
}

export type NewAppUser = New<
  AppUser,
  | 'username'
  | 'display_name'
  | 'bio'
  | 'link'
  | 'profile_pic_url'
  | 'email_verified'
  | 'private_profile'
>;

// ---------------------------------------------------------------------------
// Auth (Better Auth) — 0004_auth.sql
// ---------------------------------------------------------------------------

/** Better Auth session: one row per active browser/device session. */
export interface Session extends Timestamped {
  user_id: Uuid;
  token: string;
  expires_at: Date;
  ip_address: string | null;
  user_agent: string | null;
}

export type NewSession = New<Session, 'ip_address' | 'user_agent'>;

/** Better Auth account: one row per authentication method (provider) per user. */
export interface Account extends Timestamped {
  user_id: Uuid;
  account_id: string;
  provider_id: string;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  access_token_expires_at: Date | null;
  refresh_token_expires_at: Date | null;
  scope: string | null;
  password: string | null;
}

export type NewAccount = New<
  Account,
  | 'access_token'
  | 'refresh_token'
  | 'id_token'
  | 'access_token_expires_at'
  | 'refresh_token_expires_at'
  | 'scope'
  | 'password'
>;

/** Better Auth verification: short-lived tokens (unused until email flows). */
export interface Verification extends Timestamped {
  identifier: string;
  value: string;
  expires_at: Date;
}

export type NewVerification = New<Verification>;

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface ExerciseTemplate extends Timestamped {
  slug: string;
  title: string;
  exercise_type: ExerciseType;
  primary_muscle: string; // -> muscle_group.code
  secondary_muscles: string[]; // -> muscle_group.code[]
  equipment: string; // -> equipment.code
  media_url: string | null;
  how_to: string | null; // imported library's numbered "How to" body
  is_custom: boolean;
  owner_id: Uuid | null; // null = global catalog
  archived_at: Date | null;
}

export type NewExerciseTemplate = New<
  ExerciseTemplate,
  'secondary_muscles' | 'media_url' | 'how_to' | 'is_custom' | 'owner_id' | 'archived_at'
>;

// ---------------------------------------------------------------------------
// Routines (prescriptions)
// ---------------------------------------------------------------------------

export interface RoutineFolder extends Timestamped {
  owner_id: Uuid;
  title: string;
  position: number;
}

export type NewRoutineFolder = New<RoutineFolder, 'position'>;

export interface Routine extends Timestamped {
  owner_id: Uuid;
  folder_id: Uuid | null; // null = default "My Routines"
  title: string;
  notes: string | null;
  position: number;
}

export type NewRoutine = New<Routine, 'folder_id' | 'notes' | 'position'>;

export interface RoutineExercise extends Timestamped {
  routine_id: Uuid;
  template_id: Uuid;
  position: number;
  superset_key: string | null;
  rest_seconds: number | null;
  notes: string | null;
}

export type NewRoutineExercise = New<
  RoutineExercise,
  'superset_key' | 'rest_seconds' | 'notes'
>;

export interface RoutineSet extends Timestamped {
  routine_exercise_id: Uuid;
  position: number;
  set_type: SetType;
  reps: number | null;
  rep_range_start: number | null;
  rep_range_end: number | null;
  weight_kg: Numeric | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  custom_metric: Numeric | null;
  /** Prescribed sidecar metrics (steps, floors); mirrors workout_set.metrics. */
  metrics: SetMetrics;
}

export type NewRoutineSet = New<
  RoutineSet,
  | 'set_type'
  | 'reps'
  | 'rep_range_start'
  | 'rep_range_end'
  | 'weight_kg'
  | 'duration_seconds'
  | 'distance_meters'
  | 'custom_metric'
  | 'metrics'
>;

// ---------------------------------------------------------------------------
// Workouts (results)
// ---------------------------------------------------------------------------

export interface Workout extends Timestamped {
  owner_id: Uuid;
  routine_id: Uuid | null;
  title: string;
  notes: string | null;
  started_at: Date;
  ended_at: Date | null;
  visibility: WorkoutVisibility;
}

export type NewWorkout = New<Workout, 'routine_id' | 'notes' | 'ended_at' | 'visibility'>;

export interface WorkoutExercise extends Timestamped {
  workout_id: Uuid;
  template_id: Uuid;
  position: number;
  superset_key: string | null;
  /** Snapshotted from routine_exercise at start (0008); null when unset. */
  rest_seconds: number | null;
  notes: string | null;
}

export type NewWorkoutExercise = New<
  WorkoutExercise,
  'superset_key' | 'rest_seconds' | 'notes'
>;

/**
 * Extensible per-set metrics, shared by the prescription (`routine_set`) and
 * the result (`workout_set`) so a planned floors/steps target and the value it
 * produced are the same shape. Widening this is a data change, not a migration:
 * both columns are jsonb.
 */
export interface SetMetrics extends JsonObject {
  /** e.g. an encoded GPS track for distance_* exercise types. */
  geospatial?: unknown;
  steps?: number;
  floors?: number;
}

export interface WorkoutSet extends Timestamped {
  workout_exercise_id: Uuid;
  position: number;
  set_type: SetType;
  reps: number | null;
  weight_kg: Numeric | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  rpe: Numeric | null;
  metrics: SetMetrics;
  completed_at: Date | null;
}

export type NewWorkoutSet = New<
  WorkoutSet,
  | 'set_type'
  | 'reps'
  | 'weight_kg'
  | 'duration_seconds'
  | 'distance_meters'
  | 'rpe'
  | 'metrics'
  | 'completed_at'
>;

// ---------------------------------------------------------------------------
// Composed read models
// ---------------------------------------------------------------------------

export interface RoutineExerciseTree extends RoutineExercise {
  template: ExerciseTemplate;
  sets: RoutineSet[];
}

export interface RoutineTree extends Routine {
  folder: RoutineFolder | null;
  exercises: RoutineExerciseTree[];
}

export interface WorkoutExerciseTree extends WorkoutExercise {
  template: ExerciseTemplate;
  sets: WorkoutSet[];
}

export interface WorkoutTree extends Workout {
  exercises: WorkoutExerciseTree[];
}

/**
 * Write DTO for creating/updating a routine in one shot: the nested shape a
 * "save routine" mutation needs, so the whole tree can be replaced atomically
 * rather than patched exercise by exercise.
 */
export interface RoutineDraft {
  title: string;
  folder_id?: Uuid | null;
  notes?: string | null;
  exercises: Array<{
    template_id: Uuid;
    superset_key?: string | null;
    rest_seconds?: number | null;
    notes?: string | null;
    sets: Array<Omit<NewRoutineSet, 'routine_exercise_id' | 'position'>>;
  }>;
}

// ---------------------------------------------------------------------------
// Social — follows, likes, comments, mentions, share links (0003_social.sql)
// ---------------------------------------------------------------------------

export const FOLLOW_STATUSES = ['pending', 'accepted'] as const;
export type FollowStatus = (typeof FOLLOW_STATUSES)[number];

export interface Follow extends Timestamped {
  follower_id: Uuid;
  followee_id: Uuid;
  status: FollowStatus;
  responded_at: Date | null;
}

/** A private followee starts as 'pending'; a public one defaults to 'accepted'. */
export type NewFollow = New<Follow, 'status' | 'responded_at'>;

/** Immutable event row: no updated_at, so it extends Created rather than Timestamped. */
export interface WorkoutLike extends Created {
  workout_id: Uuid;
  user_id: Uuid;
}

export type NewWorkoutLike = New<WorkoutLike>;

export interface Comment extends Timestamped {
  workout_id: Uuid;
  author_id: Uuid;
  /** null = root comment. Non-null = reply (must belong to the same workout). */
  parent_comment_id: Uuid | null;
  body: string;
}

export type NewComment = New<Comment, 'parent_comment_id'>;

export interface CommentMention {
  comment_id: Uuid;
  mentioned_user_id: Uuid;
  created_at: Date;
}

export type NewCommentMention = Omit<CommentMention, 'created_at'> & { created_at?: Date };

export const SHARE_TARGETS = ['workout', 'routine', 'routine_folder'] as const;
export type ShareTarget = (typeof SHARE_TARGETS)[number];

export interface Share extends Created {
  token: string;
  owner_id: Uuid;
  workout_id: Uuid | null;
  routine_id: Uuid | null;
  routine_folder_id: Uuid | null;
  expires_at: Date | null;
  revoked_at: Date | null;
}

/**
 * Mirrors the `share_exactly_one_target_chk` database constraint at compile time:
 * exactly one of the three target columns must be set. Two targets, or none,
 * fail to typecheck.
 */
export type NewShare = New<
  Share,
  'workout_id' | 'routine_id' | 'routine_folder_id' | 'expires_at' | 'revoked_at'
> &
  (
    | { workout_id: Uuid; routine_id?: null; routine_folder_id?: null }
    | { routine_id: Uuid; workout_id?: null; routine_folder_id?: null }
    | { routine_folder_id: Uuid; workout_id?: null; routine_id?: null }
  );

/** Comment with its author, resolved mentions and one level of replies. */
export interface CommentNode extends Comment {
  author: Pick<AppUser, 'id' | 'username' | 'profile_pic_url'>;
  mentions: Uuid[];
  replies: CommentNode[];
}

/** A share plus the target it points at (the exclusive arc, resolved). */
export interface ShareWithTarget extends Share {
  target: ShareTarget;
}

/** Shape returned by the /follow_counts endpoint (observed). */
export interface FollowCounts {
  follower_count: number;
  following_count: number;
}

export interface WorkoutEngagement {
  workout_id: Uuid;
  like_count: number;
  comment_count: number;
}

// ---------------------------------------------------------------------------
// Query result shapes (analytics are derived from workout_set, never stored)
// ---------------------------------------------------------------------------

/** One row per set of one exercise, chronologically — the basis of History/Stats. */
export interface ExerciseHistoryRow {
  workout_id: Uuid;
  workout_title: string;
  started_at: Date;
  set_id: Uuid;
  set_type: SetType;
  reps: number | null;
  weight_kg: Numeric | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  rpe: Numeric | null;
}

/** Aggregates computed in SQL/application code from workout_set. */
export interface ExerciseTotals {
  template_id: Uuid;
  set_count: number;
  total_reps: number;
  total_volume_kg: Numeric | null;
  max_weight_kg: Numeric | null;
  best_estimated_1rm_kg: Numeric | null;
}

/**
 * Driver note: node-postgres and PGlite return `numeric` as a string to preserve
 * precision, hence `Numeric = string` above (this is the single most common
 * surprise when reading these rows). Configure a type parser if you want numbers
 * — but only where float error is acceptable (display), never for stored values.
 */
