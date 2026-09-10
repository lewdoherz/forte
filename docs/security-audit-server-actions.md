# Server-action security audit

Scope: every `"use server"` module in the repository, audited against the
project's ownership invariant.

**Result: no authorization bypass found.** All 11 actions derive the acting user
exclusively from the session, and every data-layer function re-derives ownership
before reading or writing. The findings below are hardening and correctness
defects, not exploitable cross-user vulnerabilities. This document is a
reference artifact for future audits — re-run it whenever an action or a
data-layer mutation is added.

## Invariant under test

`session.user.id === app_user.id === owner_id` — enforced by
`lib/auth-session.ts`, which deliberately exposes **no** helper that accepts a
caller-supplied user id. Ownership must therefore be re-derived inside the data
layer from the `userId` the action passed down.

## Enumeration

`"use server"` appears in exactly three modules — `lib/workout-actions.ts`,
`lib/routine-actions.ts`, `lib/exercise-actions.ts`. There are no inline
component-level actions. Every action calls `requireSessionUserId()` as its
first statement.

## Per-action results

| # | Action | Client-supplied record id | Ownership enforced in data layer | Verdict |
|---|---|---|---|---|
| 1 | `startWorkoutFormAction` | `routineId` | `routine` read scoped by `id` + `owner_id`, `forUpdate()` | **PASS** |
| 2 | `logSetFormAction` | `setId` | set → exercise → workout join compared to session user; owner check precedes state check | **PASS** |
| 3 | `uncompleteSetFormAction` | `setId` | same join + compare | **PASS** |
| 4 | `addSetFormAction` | `workoutExerciseId` | same join + compare, inside a transaction with the parent row locked | **PASS** |
| 5 | `removeSetFormAction` | `setId` | same join + compare | **PASS** |
| 6 | `finishWorkoutFormAction` | `workoutId` | `owner_id`/`ended_at` read then compared | **PASS** |
| 7 | `saveRoutine` | `id`, `template_id[]` | `updateRoutine` reads owner + compares; `assertExercisesVisible` rejects invisible templates | **PASS** |
| 8 | `deleteRoutine` | `id` | `routine` read scoped by owner | **PASS** |
| 9 | `createExercise` | — | insert writes `owner_id: userId` | **PASS** |
| 10 | `updateExercise` | `id` | `is_custom && owner_id === userId` gate | **PASS** |
| 11 | `deleteExercise` | `id` | same gate | **PASS** |

Cross-user **reads** by actions: none. Actions return only `{error}`, `void`, or
an id of a row the session just created. `exercise_template` reads are
deliberately broader (global rows have `owner_id IS NULL` and are public by
design); mutations remain gated on `is_custom && owner_id === userId`.

Note the ordering in `assertActiveOwned`: the owner check precedes the
completion-state check, so `not_active` cannot be used to probe a foreign
workout's state.

## Findings

| ID | Severity | Status |
|---|---|---|
| AUTHZ-CHECK-THEN-ACT | low | **Fixed** |
| REDIRECT-SWALLOWED-IN-CATCH | low (user-visible) | **Fixed** |
| DELETE-IN-USE-EXERCISE-SILENT-NOOP | low (user-visible) | **Fixed** |
| TEMPLATE-VISIBILITY-NOT-REAPPLIED-ON-READ | informational | **Fixed** |
| REVALIDATE-UNVALIDATED-PATH-SEGMENT | informational | **Fixed** |
| ERROR-MESSAGE-ORACLE | informational | **Accepted** (rationale below) |

### AUTHZ-CHECK-THEN-ACT — fixed

Mutations verified ownership with a preceding `SELECT` and then issued the write
keyed on the bare record id, outside a transaction. Not exploitable: nothing in
the repository mutates `owner_id` or `workout_exercise.workout_id`, so a row
cannot change hands between check and write. The reachable consequence was a
same-user race (logging a set against a workout finished concurrently;
concurrent `addSet` colliding on `workout_set_position_key`).

Fix: the ownership/state predicate is now applied **to the mutating statement**
(`ownedActiveExerciseIds`), the preceding checks are retained for accurate
errors, `finishWorkout` additionally constrains `owner_id` and `ended_at IS NULL`
on its `UPDATE`, and `addSet` runs in a transaction with the parent row locked.

### REDIRECT-SWALLOWED-IN-CATCH — fixed

`redirect()` signals by throwing `NEXT_REDIRECT`. Called inside the `try` of
`createExercise`/`updateExercise`, the bare `catch` converted a *successful*
write into an error banner, and the user's retry created a duplicate custom
exercise. Fix: `redirect()` (and `revalidatePath`) now run after the `try`.

### DELETE-IN-USE-EXERCISE-SILENT-NOOP — fixed

`routine_exercise.template_id` and `workout_exercise.template_id` are `NO ACTION`,
so an in-use custom exercise cannot be physically deleted. `deleteExercise`
swallowed the resulting foreign-key error and still redirected as if it had
worked, leaving the user with an exercise they could not remove and no
explanation. Fix: `deleteCustomExercise` archives (`archived_at = now()`) when
the template is referenced, otherwise deletes — the behaviour the schema and
`schema/tests/verify-schema.ts` already document.

### TEMPLATE-VISIBILITY-NOT-REAPPLIED-ON-READ — fixed

`getRoutineTree`/`getWorkoutTree` loaded referenced templates by id with no
visibility predicate, unlike the write path's `assertExercisesVisible`. Not
reachable today (nothing can create a cross-user reference), but it would become
a disclosure the moment an import, share-copy or seed path did. Fix: both reads
now apply the same `owner_id IS NULL OR owner_id = userId` predicate, so they
fail closed rather than render a foreign template.

### REVALIDATE-UNVALIDATED-PATH-SEGMENT — fixed

Four actions read `workoutId` from `FormData` without validation and
interpolated it into `revalidatePath`. Impact was bounded (a cache key only —
the mutation is authorized on the set/exercise id), but untrusted input one
refactor away from being trusted. Fix: `workoutPathFromForm()` accepts the id
only when it parses as a uuid; `deleteRoutine`, `updateExercise` and
`deleteExercise` likewise now validate their bound id.

### ERROR-MESSAGE-ORACLE — accepted

Distinct messages let a caller distinguish "exists but not yours" from "does not
exist". Accepted rather than changed, because: ids are server-generated UUIDv4
values (`gen_random_uuid()`) and are not enumerable; the leaked bit is only that
one exact UUID exists; no action returns row contents; and the owner-before-state
ordering already prevents turning it into a state probe. Collapsing the messages
would degrade the guidance given to legitimate users for no practical gain. To
revisit if ids ever become user-visible or sequential.

## Not verified by this audit

- **Runtime race behaviour.** The concurrency analysis is derived from the code
  plus PostgreSQL's default `READ COMMITTED` semantics and the declared deferrable
  unique constraints — reasoned, not observed.
- **Next.js runtime treatment of a hostile `revalidatePath` argument.**
- **Whether any deployed database contains a cross-user template reference**
  (unreachable through in-repo write paths).
- **Row-level security.** No RLS policies exist; all ownership enforcement is
  application-layer by design.
