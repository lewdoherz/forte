import { randomBytes } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Database } from "./db";
import type { SetType } from "@/schema/types";

/**
 * Share links for routines.
 *
 * The `share` table already exists (0003_social.sql) as a capability: a row is
 * one target plus an opaque token, with `revoked_at` / `expires_at` deciding
 * whether the token currently grants access. No schema change is needed for
 * routine sharing — the exclusive-arc target column is `routine_id`, and the
 * table's `share_token_length_chk` already floors the token at 10 characters.
 *
 * These helpers are the only place the table is read or written. They use raw
 * SQL through the shared Kysely instance because `share` is deliberately NOT
 * part of the application's `Database` table map in `lib/db.ts` (that map is
 * owned elsewhere and only registers tables the app queries through the builder).
 *
 * Read-only by construction: the public route calls `resolveRoutineShare`, which
 * selects columns and never mutates. Creation and revocation are owner-scoped
 * server actions (`lib/share-actions.ts`), never reachable from the public route.
 */

/**
 * A share token is a bearer capability: whoever holds it can read the target, so
 * it must be unguessable rather than merely unique. 16 random bytes from the
 * CSPRNG, rendered as URL-safe base64, give 128 bits across 22 characters — far
 * above the table's 10-character floor — and are not derived from the routine id,
 * the owner, or any counter, so possession cannot be inferred from the URL.
 */
export function generateShareToken(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * The routine's active share token, creating one on first request.
 *
 * Lazy rather than eager: a routine that is never shared never gets a row, and
 * the same link is handed back on every subsequent copy so the URL a user has
 * already sent out keeps working. Ownership is checked against `routine` before
 * anything is written, so the caller cannot mint a link for someone else's
 * routine. Returns `undefined` when the routine does not exist or is not the
 * caller's.
 */
export async function getOrCreateRoutineShareToken(
  db: Kysely<Database>,
  userId: string,
  routineId: string,
): Promise<string | undefined> {
  const owned = await db
    .selectFrom("routine")
    .select("id")
    .where("id", "=", routineId)
    .where("owner_id", "=", userId)
    .executeTakeFirst();
  if (!owned) return undefined;

  // An expired or revoked link is not "active", so a new one is minted below and
  // the old token stays dead. Only the newest active row is returned.
  const existing = (
    await sql<{ token: string }>`
      select token
      from share
      where routine_id = ${routineId}
        and owner_id = ${userId}
        and revoked_at is null
        and (expires_at is null or expires_at > now())
      order by created_at desc
      limit 1
    `.execute(db)
  ).rows[0];
  if (existing) return existing.token;

  // A collision is astronomically unlikely at 128 bits; retrying a couple of
  // times keeps the unique constraint as a real guard without failing the
  // request if a broken RNG ever produced one.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateShareToken();
    try {
      const inserted = (
        await sql<{ token: string }>`
          insert into share (token, owner_id, routine_id)
          values (${token}, ${userId}, ${routineId})
          returning token
        `.execute(db)
      ).rows[0];
      return inserted.token;
    } catch (error) {
      // `code` is the SQLSTATE the drivers attach; the message check covers a
      // driver that omits it. Anything else is a real failure.
      const duplicateToken =
        error instanceof Error &&
        (("code" in error && error.code === "23505") ||
          /unique|duplicate key/i.test(error.message));
      if (!duplicateToken) throw error;
    }
  }
  throw new Error("share_token_collision");
}

/**
 * Revokes every active link for one of the caller's routines.
 *
 * Owner-scoped by the `where` clause, so a non-owner revokes nothing. Revocation
 * is a stamp, not a delete: the row survives as the record that the link once
 * existed, and the next copy mints a fresh token.
 */
export async function revokeRoutineShareLinks(
  db: Kysely<Database>,
  userId: string,
  routineId: string,
): Promise<void> {
  await sql`
    update share
    set revoked_at = now()
    where routine_id = ${routineId}
      and owner_id = ${userId}
      and revoked_at is null
  `.execute(db);
}

/** One planned exercise of a shared routine, with only the display fields. */
export interface SharedRoutineExercise {
  id: string;
  supersetKey: string | null;
  restSeconds: number | null;
  slug: string;
  title: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  /** Set types in stored order; the summary counts working sets from these. */
  setTypes: SetType[];
}

/**
 * Everything a read-only viewer needs, and nothing else.
 *
 * Deliberately narrow: the owner is reduced to a display name (never the email
 * or any other account field), and each exercise to the catalog fields the
 * thumbnail and the muscle calculations use. Reps, weights and per-exercise
 * notes are not part of what the routine view shows, so they are not fetched.
 */
export interface SharedRoutine {
  id: string;
  title: string;
  notes: string | null;
  /**
   * Product decision: a shared routine is attributed to its owner by display
   * name, falling back to username, and to nothing at all when neither is set.
   * Both are public profile fields; the email is never exposed.
   */
  ownerName: string | null;
  exercises: SharedRoutineExercise[];
}

interface ShareTargetRow {
  routine_id: string;
  display_name: string | null;
  username: string | null;
  title: string;
  notes: string | null;
}

interface ExerciseRow {
  id: string;
  superset_key: string | null;
  rest_seconds: number | null;
  slug: string;
  title: string;
  primary_muscle: string;
  secondary_muscles: string[];
}

interface SetRow {
  routine_exercise_id: string;
  set_type: SetType;
}

/**
 * Resolves a token to the routine it currently shares, or `undefined`.
 *
 * `revoked_at` and `expires_at` are enforced in the query, so a dead token is
 * indistinguishable from a token that never existed — the public route turns
 * both into a 404, and possession is the whole of the authorization. The join
 * to `routine` makes a non-routine share (a workout or folder token) resolve to
 * nothing here.
 */
export async function resolveRoutineShare(
  db: Kysely<Database>,
  token: string,
): Promise<SharedRoutine | undefined> {
  const target = (
    await sql<ShareTargetRow>`
      select s.routine_id, u.display_name, u.username, r.title, r.notes
      from share s
      join routine r on r.id = s.routine_id
      join app_user u on u.id = r.owner_id
      where s.token = ${token}
        and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())
    `.execute(db)
  ).rows[0];
  if (!target) return undefined;

  const exercises = (
    await sql<ExerciseRow>`
      select re.id, re.superset_key, re.rest_seconds,
             t.slug, t.title, t.primary_muscle, t.secondary_muscles
      from routine_exercise re
      join exercise_template t on t.id = re.template_id
      where re.routine_id = ${target.routine_id}
      order by re.position
    `.execute(db)
  ).rows;

  const sets = (
    await sql<SetRow>`
      select rs.routine_exercise_id, rs.set_type
      from routine_set rs
      join routine_exercise re on re.id = rs.routine_exercise_id
      where re.routine_id = ${target.routine_id}
      order by rs.routine_exercise_id, rs.position
    `.execute(db)
  ).rows;

  const setTypesByExercise = new Map<string, SetType[]>();
  for (const set of sets) {
    const list = setTypesByExercise.get(set.routine_exercise_id);
    if (list) list.push(set.set_type);
    else setTypesByExercise.set(set.routine_exercise_id, [set.set_type]);
  }

  return {
    id: target.routine_id,
    title: target.title,
    notes: target.notes,
    ownerName: target.display_name?.trim() || target.username || null,
    exercises: exercises.map((exercise) => ({
      id: exercise.id,
      supersetKey: exercise.superset_key,
      restSeconds: exercise.rest_seconds,
      slug: exercise.slug,
      title: exercise.title,
      primaryMuscle: exercise.primary_muscle,
      secondaryMuscles: exercise.secondary_muscles,
      setTypes: setTypesByExercise.get(exercise.id) ?? [],
    })),
  };
}
