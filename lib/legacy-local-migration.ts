import type { ExerciseType, RoutineFolder, RoutineTree, WorkoutSet } from "@/schema/types";
import type { LoggedExercise, LoggedWorkout } from "@/lib/workout-sync";
import {
  LOCAL_GUEST_OWNER,
  openLocalGuestStore,
  openOfflineStore,
  type OfflineCatalogExercise,
} from "@/lib/offline-store";
import { loadBuiltinCatalog, localizeBuiltinCatalog } from "@/lib/builtin-catalog";

const LEGACY_HISTORY_KEY = "forte:fresh-offline-history:v1";
const LEGACY_DRAFT_KEY = "forte:fresh-offline-draft:v1";
const LEGACY_MIGRATED_KEY = "forte:legacy-quick-migrated:v1";

interface LegacyQuickSet {
  exercise?: string;
  kg?: string;
  reps?: string;
  done?: boolean;
}

interface LegacyQuickWorkout {
  title?: string;
  finishedAt?: string;
  completedSets?: number;
  sets?: LegacyQuickSet[];
}

export interface LocalGuestDataSummary {
  workoutCount: number;
  routineCount: number;
  folderCount: number;
  totalSetCount: number;
  hasAny: boolean;
}

function parseNumericString(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(n);
}

function parseNonNegInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function deterministicLocalCustomId(title: string): string {
  // Stable deterministic UUID v5-shaped ID from normalized title so repeated
  // migration or re-renders produce the exact same template_id.
  const norm = title.trim().toLowerCase() || "local-exercise";
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < norm.length; i++) {
    const c = norm.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  const hex =
    h1.toString(16).padStart(8, "0") +
    h2.toString(16).padStart(8, "0") +
    ((h1 ^ 0x55aa55aa) >>> 0).toString(16).padStart(8, "0") +
    ((h2 ^ 0xa5a5a5a5) >>> 0).toString(16).padStart(8, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function matchCatalogExercise(
  rawName: string,
  catalog: OfflineCatalogExercise[],
): OfflineCatalogExercise | null {
  const norm = rawName.trim().toLowerCase();
  if (!norm) return null;
  const exact = catalog.find(
    (e) => e.title.toLowerCase() === norm || e.slug.toLowerCase() === norm,
  );
  if (exact) return exact;
  // Common shorthand from previous RC default ("Squat" -> "Squat (Barbell)").
  const prefix = catalog.find((e) => e.title.toLowerCase().startsWith(`${norm} (`));
  if (prefix) return prefix;
  return null;
}

function convertLegacyWorkout(
  raw: LegacyQuickWorkout,
  catalog: OfflineCatalogExercise[],
  isFinished: boolean,
): LoggedWorkout | null {
  const rawSets = Array.isArray(raw.sets) ? raw.sets : [];
  const meaningful = rawSets.filter(
    (s) =>
      s &&
      (s.done ||
        (s.kg && s.kg.trim() !== "") ||
        (s.reps && s.reps.trim() !== "") ||
        (s.exercise && s.exercise.trim() !== "")),
  );
  if (meaningful.length === 0) return null;

  const finishedDate = raw.finishedAt ? new Date(raw.finishedAt) : new Date();
  const validFinished = Number.isNaN(finishedDate.getTime()) ? new Date() : finishedDate;
  const startedAt = new Date(validFinished.getTime() - 10 * 60 * 1000);
  const workoutId = crypto.randomUUID();

  // Group contiguous sets by exercise name so a 3-set Squat workout becomes 1 exercise with 3 sets.
  const groups: Array<{ name: string; sets: LegacyQuickSet[] }> = [];
  for (const s of meaningful) {
    const name = (s.exercise ?? "").trim() || "Local Exercise";
    const last = groups[groups.length - 1];
    if (last && last.name.toLowerCase() === name.toLowerCase()) {
      last.sets.push(s);
    } else {
      groups.push({ name, sets: [s] });
    }
  }

  const exercises: LoggedExercise[] = groups.map((group, pos) => {
    const matched = matchCatalogExercise(group.name, catalog);
    const weId = crypto.randomUUID();
    const templateId = matched?.id ?? deterministicLocalCustomId(group.name);
    const slug =
      matched?.slug ??
      (group.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") ||
        "local-exercise");
    const exerciseType: ExerciseType = matched?.exercise_type ?? "weight_reps";

    const sets: WorkoutSet[] = group.sets.map((s, idx) => {
      const completed = Boolean(s.done) || isFinished;
      return {
        id: crypto.randomUUID(),
        workout_exercise_id: weId,
        position: idx,
        set_type: "normal",
        reps: parseNonNegInt(s.reps),
        weight_kg: parseNumericString(s.kg),
        duration_seconds: null,
        distance_meters: null,
        rpe: null,
        metrics: {},
        completed_at: completed ? validFinished : null,
        created_at: startedAt,
        updated_at: validFinished,
      };
    });

    return {
      id: weId,
      workout_id: workoutId,
      template_id: templateId,
      position: pos,
      superset_key: null,
      rest_seconds: null,
      notes: null,
      created_at: startedAt,
      updated_at: validFinished,
      template: {
        id: templateId,
        slug,
        title: matched?.title ?? group.name,
        exercise_type: exerciseType,
        primary_muscle: matched?.primary_muscle ?? "other",
      },
      sets,
    };
  });

  return {
    id: workoutId,
    owner_id: LOCAL_GUEST_OWNER,
    routine_id: null,
    title: (raw.title ?? "").trim() || "Local Workout",
    notes: null,
    visibility: "private",
    started_at: startedAt,
    ended_at: isFinished ? validFinished : null,
    created_at: startedAt,
    updated_at: validFinished,
    exercises,
  };
}

/**
 * Losslessly migrates any workouts saved by the previous RC's Quick local
 * workout screen (`forte:fresh-offline-history:v1` / `forte:fresh-offline-draft:v1`)
 * into the isolated `forte-local-guest` IndexedDB store.
 *
 * Safe and idempotent: runs once per saved legacy payload and never discards
 * data before IndexedDB commits.
 */
export async function migrateLegacyQuickWorkouts(): Promise<number> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return 0;

  let rawHistory: string | null = null;
  let rawDraft: string | null = null;
  try {
    if (window.localStorage.getItem(LEGACY_MIGRATED_KEY)) return 0;
    rawHistory = window.localStorage.getItem(LEGACY_HISTORY_KEY);
    rawDraft = window.localStorage.getItem(LEGACY_DRAFT_KEY);
  } catch {
    return 0;
  }

  if (!rawHistory && !rawDraft) return 0;

  const historyItems: LegacyQuickWorkout[] = [];
  if (rawHistory) {
    try {
      const parsed = JSON.parse(rawHistory);
      if (Array.isArray(parsed)) historyItems.push(...(parsed as LegacyQuickWorkout[]));
    } catch {
      // Ignore malformed JSON.
    }
  }

  let draftItem: LegacyQuickWorkout | null = null;
  if (rawDraft) {
    try {
      const parsed = JSON.parse(rawDraft) as LegacyQuickWorkout;
      const hasInput = (parsed.sets ?? []).some(
        (s) => s.done || (s.kg && s.kg.trim()) || (s.reps && s.reps.trim()),
      );
      if (hasInput) draftItem = parsed;
    } catch {
      // Ignore malformed JSON.
    }
  }

  if (historyItems.length === 0 && !draftItem) return 0;

  const rawCatalog = await loadBuiltinCatalog();
  const catalogExercises = rawCatalog
    ? localizeBuiltinCatalog(rawCatalog, "en", LOCAL_GUEST_OWNER).exercises
    : [];

  const guestStore = await openLocalGuestStore();
  let migrated = 0;

  for (const item of historyItems) {
    const converted = convertLegacyWorkout(item, catalogExercises, true);
    if (converted) {
      await guestStore.writeWorkout(converted);
      await guestStore.markPending(converted.id);
      migrated += 1;
    }
  }

  if (draftItem) {
    const convertedDraft = convertLegacyWorkout(draftItem, catalogExercises, false);
    if (convertedDraft) {
      await guestStore.writeWorkout(convertedDraft);
      await guestStore.markPending(convertedDraft.id);
      migrated += 1;
    }
  }

  try {
    window.localStorage.setItem(LEGACY_MIGRATED_KEY, new Date().toISOString());
    window.localStorage.removeItem(LEGACY_HISTORY_KEY);
    window.localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // Non-fatal.
  }

  return migrated;
}

/**
 * Inspects whether the device holds unclaimed local-only training data
 * (including migrated Quick local workouts). Runs legacy migration first so
 * upgraded devices immediately surface the user's previous workouts.
 */
export async function readLocalGuestDataSummary(): Promise<LocalGuestDataSummary> {
  if (typeof indexedDB === "undefined") {
    return { workoutCount: 0, routineCount: 0, folderCount: 0, totalSetCount: 0, hasAny: false };
  }
  await migrateLegacyQuickWorkouts();
  try {
    const guestStore = await openLocalGuestStore();
    const [workouts, routines, folders] = await Promise.all([
      guestStore.listWorkouts(),
      guestStore.listRoutines(),
      guestStore.listFolders(),
    ]);
    const totalSetCount = workouts.reduce(
      (sum, w) => sum + w.exercises.reduce((s, ex) => s + ex.sets.length, 0),
      0,
    );
    return {
      workoutCount: workouts.length,
      routineCount: routines.length,
      folderCount: folders.length,
      totalSetCount,
      hasAny: workouts.length > 0 || routines.length > 0 || folders.length > 0,
    };
  } catch {
    return { workoutCount: 0, routineCount: 0, folderCount: 0, totalSetCount: 0, hasAny: false };
  }
}

/**
 * Explicitly associates all device-local guest workouts, routines, and folders
 * with the currently signed-in cloud account `userId` and queues them for sync.
 *
 * Clears `forte-local-guest` ONLY after every record is committed to `userId`'s
 * account store so a crash or failure can never lose local work.
 */
export async function claimLocalGuestDataIntoAccount(userId: string): Promise<{
  workoutsClaimed: number;
  routinesClaimed: number;
  foldersClaimed: number;
}> {
  if (!userId || userId === LOCAL_GUEST_OWNER) {
    return { workoutsClaimed: 0, routinesClaimed: 0, foldersClaimed: 0 };
  }
  await migrateLegacyQuickWorkouts();
  const guestStore = await openLocalGuestStore();
  const [guestWorkouts, guestRoutines, guestFolders] = await Promise.all([
    guestStore.listWorkouts(),
    guestStore.listRoutines(),
    guestStore.listFolders(),
  ]);

  if (guestWorkouts.length === 0 && guestRoutines.length === 0 && guestFolders.length === 0) {
    return { workoutsClaimed: 0, routinesClaimed: 0, foldersClaimed: 0 };
  }

  const accountStore = await openOfflineStore(userId);
  const accountCatalog = await accountStore.readCatalog();
  const serverIdBySlug = new Map((accountCatalog?.exercises ?? []).map((e) => [e.slug, e.id]));

  const remapTemplateId = (id: string, slug: string) => serverIdBySlug.get(slug) ?? id;
  const nowIso = new Date().toISOString();

  // 1. Folders first.
  for (const folder of guestFolders) {
    const owned: RoutineFolder = { ...folder, owner_id: userId };
    await accountStore.markFolderPending({
      id: owned.id,
      op: "upsert",
      input: { id: owned.id, title: owned.title, position: owned.position },
      updatedAt: nowIso,
    });
    await accountStore.writeFolder(owned);
  }

  // 2. Routines (remapping bundled-catalog synthetic UUIDs by slug where known).
  for (const routine of guestRoutines) {
    const templateSlugs: Record<string, string> = {};
    const exercises = routine.exercises.map((ex) => {
      const nextId = remapTemplateId(ex.template_id, ex.template.slug);
      templateSlugs[nextId] = ex.template.slug;
      return {
        ...ex,
        template_id: nextId,
        template: { ...ex.template, id: nextId },
      };
    });
    const ownedRoutine: RoutineTree = {
      ...routine,
      owner_id: userId,
      exercises,
    };
    await accountStore.markRoutinePending({
      id: ownedRoutine.id,
      op: "upsert",
      templateSlugs,
      input: {
        id: ownedRoutine.id,
        title: ownedRoutine.title,
        folder_id: ownedRoutine.folder_id,
        position: ownedRoutine.position,
        notes: ownedRoutine.notes,
        exercises: ownedRoutine.exercises.map((ex) => ({
          template_id: ex.template_id,
          superset_key: ex.superset_key,
          rest_seconds: ex.rest_seconds,
          notes: ex.notes,
          sets: ex.sets.map((s) => ({
            set_type: s.set_type,
            reps: s.reps,
            weight_kg: s.weight_kg,
            duration_seconds: s.duration_seconds,
            distance_meters: s.distance_meters,
            metrics: s.metrics,
          })),
        })),
      },
      updatedAt: nowIso,
    });
    await accountStore.writeRoutine(ownedRoutine);
  }

  // 3. Workouts (remapping bundled-catalog synthetic UUIDs by slug where known).
  for (const workout of guestWorkouts) {
    const ownedWorkout: LoggedWorkout = {
      ...workout,
      owner_id: userId,
      exercises: workout.exercises.map((ex) => {
        const nextId = remapTemplateId(ex.template_id, ex.template.slug);
        return {
          ...ex,
          template_id: nextId,
          template: { ...ex.template, id: nextId },
        };
      }),
    };
    await accountStore.markPending(ownedWorkout.id);
    await accountStore.writeWorkout(ownedWorkout);
  }

  // Clear guest store only after every record is safely committed in the account store.
  await guestStore.clear();

  return {
    workoutsClaimed: guestWorkouts.length,
    routinesClaimed: guestRoutines.length,
    foldersClaimed: guestFolders.length,
  };
}

/** Explicitly discards unclaimed device-local guest data when the user asks to. */
export async function discardLocalGuestData(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const guestStore = await openLocalGuestStore();
  await guestStore.clear();
}
