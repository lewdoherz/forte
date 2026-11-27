"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RoutineFolder, RoutineTree } from "@/schema/types";
import type { LoggedWorkout } from "@/lib/workout-sync";
import {
  LOCAL_GUEST_OWNER,
  openExistingOfflineStore,
  openLocalGuestStore,
  type OfflineCatalogExercise,
  type OfflineCatalogSnapshot,
  type OfflineStore,
} from "@/lib/offline-store";
import {
  deleteRoutineFolderOffline,
  deleteRoutineOffline,
  duplicateRoutineOffline,
  flushOfflineQueue,
  organizeRoutinesOffline,
  readOfflineSyncSnapshot,
  refreshOfflineBootstrap,
  saveRoutineFolderOffline,
  saveRoutineOffline,
  startEmptyWorkoutOffline,
  startWorkoutFromRoutineOffline,
  type OfflineSyncSnapshot,
} from "@/lib/offline-sync";
import {
  enrichCatalogWithBuiltin,
  loadBuiltinCatalog,
} from "@/lib/builtin-catalog";
import {
  claimLocalGuestDataIntoAccount,
  discardLocalGuestData,
  migrateLegacyQuickWorkouts,
  readLocalGuestDataSummary,
  type LocalGuestDataSummary,
} from "@/lib/legacy-local-migration";
import {
  computeLocalDashboardSummary,
  computeRecentExerciseIds,
  mergeLocalPreviousPerformances,
  type LocalEarnedRecord,
} from "@/lib/local-analytics";
import { recordCategoryLabel } from "@/lib/records";
import { formatSetValues, formatVolumeKg, summarizeWorkout } from "@/lib/workout-stats";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/context";
import { NavigationIcon, type NavigationIconName } from "@/components/bottom-nav";
import { DevicePreferences } from "@/components/device-preferences";
import { ExerciseDetailView } from "@/components/exercise-detail-view";
import { ExerciseThumbnail } from "@/components/exercise-media";
import { LanguageSwitcher } from "@/components/language-switcher";
import { RoutineEditor } from "@/components/routine-editor";
import { WorkoutLogger } from "@/components/workout-logger";

type PrimaryTab = "home" | "workout" | "profile";

type AppScreen =
  | { kind: "tab"; tab: PrimaryTab }
  | { kind: "history" }
  | { kind: "progress"; selectedExerciseId?: string }
  | { kind: "exercises" }
  | { kind: "settings" }
  | { kind: "exerciseDetail"; exerciseId: string; initialTab?: "how-to" | "statistics" | "history"; backTo: PrimaryTab | "exercises" | "progress" | "recap"; backWorkoutId?: string }
  | { kind: "logger"; workout: LoggedWorkout }
  | { kind: "routineEditor"; routine?: RoutineTree; initialFolderId?: string | null }
  | { kind: "recap"; workoutId: string; backTo: PrimaryTab | "history" };

function initialScreenFromPath(): AppScreen {
  if (typeof window === "undefined") return { kind: "tab", tab: "home" };
  const path = window.location.pathname;
  if (path === "/workout" || path.startsWith("/routines")) return { kind: "tab", tab: "workout" };
  if (path === "/profile") return { kind: "tab", tab: "profile" };
  if (path.startsWith("/exercises")) return { kind: "exercises" };
  if (path.startsWith("/progress")) return { kind: "progress" };
  if (path.startsWith("/account")) return { kind: "settings" };
  if (path === "/workouts") return { kind: "history" };
  return { kind: "tab", tab: "home" };
}

function activePrimaryTab(screen: AppScreen): PrimaryTab {
  if (screen.kind === "tab") return screen.tab;
  if (screen.kind === "history" || screen.kind === "recap") return "home";
  if (screen.kind === "routineEditor" || screen.kind === "logger") return "workout";
  return "profile";
}

export function OfflineAppShell() {
  const { locale, t } = useI18n();
  const [loading, setLoading] = useState(true);
  // Start conservatively offline until a live server sync/probe succeeds.
  const [online, setOnline] = useState(false);
  const [ownerId, setOwnerId] = useState<string>(LOCAL_GUEST_OWNER);
  const [store, setStore] = useState<OfflineStore | null>(null);
  const [catalog, setCatalog] = useState<OfflineCatalogSnapshot | undefined>(undefined);
  const [folders, setFolders] = useState<RoutineFolder[]>([]);
  const [routines, setRoutines] = useState<RoutineTree[]>([]);
  const [workouts, setWorkouts] = useState<LoggedWorkout[]>([]);
  const [syncSnap, setSyncSnap] = useState<OfflineSyncSnapshot | null>(null);
  const [screen, setScreen] = useState<AppScreen>({ kind: "tab", tab: "home" });

  // Local guest import prompt (shown when signed into a cloud account and guest data exists)
  const [guestSummary, setGuestSummary] = useState<LocalGuestDataSummary | null>(null);
  const [guestDismissed, setGuestDismissed] = useState(false);
  const [importingGuest, setImportingGuest] = useState(false);
  const [guestNotice, setGuestNotice] = useState<string | null>(null);

  // Exercises library search/filter state
  const [exQuery, setExQuery] = useState("");
  const [exMuscle, setExMuscle] = useState("");
  const [exEquipment, setExEquipment] = useState("");

  // Routine folder creation / rename UI
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const reloadLocalState = useCallback(
    async (activeStore: OfflineStore, activeOwner: string) => {
      const [cachedCat, rawBuiltin, fList, rList, wList, snap] = await Promise.all([
        activeStore.readCatalog(),
        loadBuiltinCatalog(),
        activeStore.listFolders(),
        activeStore.listRoutines(),
        activeStore.listWorkouts(),
        readOfflineSyncSnapshot(activeStore),
      ]);
      const mergedCat = enrichCatalogWithBuiltin(cachedCat, rawBuiltin, locale, activeOwner);
      setCatalog(mergedCat);
      setFolders(fList);
      setRoutines(rList);
      setWorkouts(wList);
      setSyncSnap(snap);
      return { cat: mergedCat, fList, rList, wList, snap };
    },
    [locale],
  );

  const attemptSync = useCallback(
    async (activeStore: OfflineStore, activeOwner: string) => {
      if (activeOwner === LOCAL_GUEST_OWNER) return null;
      const snap = await flushOfflineQueue(activeStore);
      setSyncSnap(snap);
      if (snap.status === "auth_required") {
        setOnline(true);
        return snap;
      }
      if (snap.status === "offline" || snap.error === "network") {
        setOnline(false);
        return snap;
      }
      const refreshed = await refreshOfflineBootstrap(activeStore);
      if (refreshed) {
        setOnline(true);
        await reloadLocalState(activeStore, activeOwner);
      } else if (snap.status === "synced" && snap.pendingCount === 0) {
        setOnline(false);
      }
      return snap;
    },
    [reloadLocalState],
  );

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        // Always migrate any previous-RC Quick local workouts losslessly first.
        await migrateLegacyQuickWorkouts();

        const existing = await openExistingOfflineStore();
        if (!active) return;

        const targetOwner = existing?.ownerId ?? LOCAL_GUEST_OWNER;
        const targetStore = existing?.store ?? (await openLocalGuestStore());
        if (!active) return;

        setOwnerId(targetOwner);
        setStore(targetStore);
        const { wList } = await reloadLocalState(targetStore, targetOwner);
        if (!active) return;

        if (targetOwner !== LOCAL_GUEST_OWNER) {
          void readLocalGuestDataSummary().then((summary) => {
            if (active && summary.hasAny) setGuestSummary(summary);
          });
        }

        // Deep link directly into a specific workout or exercise if launched on that URL.
        const path = window.location.pathname;
        const workoutMatch = /^\/workouts\/([0-9a-f-]{36})$/i.exec(path);
        if (workoutMatch) {
          const found = wList.find((w) => w.id === workoutMatch[1]);
          if (found) {
            setScreen(
              found.ended_at === null
                ? { kind: "logger", workout: found }
                : { kind: "recap", workoutId: found.id, backTo: "home" },
            );
            setLoading(false);
            return;
          }
        }
        const exMatch = /^\/exercises\/([0-9a-f-]{36})$/i.exec(path);
        if (exMatch) {
          setScreen({
            kind: "exerciseDetail",
            exerciseId: exMatch[1],
            backTo: "exercises",
          });
          setLoading(false);
          return;
        }

        setScreen(initialScreenFromPath());
        setLoading(false);

        if (navigator.onLine && targetOwner !== LOCAL_GUEST_OWNER) {
          void attemptSync(targetStore, targetOwner);
        }
      } catch {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [attemptSync, reloadLocalState]);

  useEffect(() => {
    const onOnline = () => {
      if (store && ownerId !== LOCAL_GUEST_OWNER) {
        void attemptSync(store, ownerId);
      }
    };
    const onOffline = () => setOnline(false);
    const onVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        store &&
        ownerId !== LOCAL_GUEST_OWNER
      ) {
        void attemptSync(store, ownerId);
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [attemptSync, ownerId, store]);

  // Periodic reconnect retry while pending work exists.
  useEffect(() => {
    if (!store || ownerId === LOCAL_GUEST_OWNER) return;
    if (!syncSnap || syncSnap.pendingCount === 0 || syncSnap.status === "auth_required") return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void attemptSync(store, ownerId);
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [attemptSync, ownerId, store, syncSnap]);

  const activeWorkout = useMemo(
    () => workouts.find((w) => w.ended_at === null) ?? null,
    [workouts],
  );
  const completedWorkouts = useMemo(
    () => workouts.filter((w) => w.ended_at !== null),
    [workouts],
  );
  const pendingWorkoutSet = useMemo(
    () => new Set(syncSnap?.pendingWorkoutIds ?? []),
    [syncSnap],
  );
  const pendingRoutineSet = useMemo(
    () => new Set(syncSnap?.pendingRoutineIds ?? []),
    [syncSnap],
  );

  const timeZone =
    catalog?.profile.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const muscles = useMemo(() => catalog?.muscles ?? [], [catalog]);
  const equipment = useMemo(() => catalog?.equipment ?? [], [catalog]);
  const exercises = useMemo(() => catalog?.exercises ?? [], [catalog]);
  const muscleNames = useMemo(() => new Map(muscles.map((m) => [m.code, m.display_name])), [muscles]);

  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const exerciseBySlug = useMemo(() => new Map(exercises.map((e) => [e.slug, e])), [exercises]);

  const recentExerciseIds = useMemo(() => computeRecentExerciseIds(workouts, 12), [workouts]);
  const mergedPrevious = useMemo(
    () => mergeLocalPreviousPerformances(catalog?.previousPerformances, workouts),
    [catalog?.previousPerformances, workouts],
  );
  const dashboard = useMemo(
    () => computeLocalDashboardSummary(workouts, exercises, locale, timeZone),
    [workouts, exercises, locale, timeZone],
  );

  const filteredExercises = useMemo(() => {
    const q = exQuery.trim().toLocaleLowerCase();
    return exercises.filter(
      (ex) =>
        (!q || `${ex.title} ${ex.slug}`.toLocaleLowerCase().includes(q)) &&
        (!exMuscle || ex.primary_muscle === exMuscle || ex.secondary_muscles.includes(exMuscle)) &&
        (!exEquipment || ex.equipment === exEquipment),
    );
  }, [exercises, exQuery, exMuscle, exEquipment]);

  const recentExercises = useMemo(() => {
    if (exQuery || exMuscle || exEquipment) return [];
    return recentExerciseIds
      .map((id) => exerciseById.get(id))
      .filter((e): e is OfflineCatalogExercise => e !== undefined)
      .slice(0, 6);
  }, [exQuery, exMuscle, exEquipment, recentExerciseIds, exerciseById]);

  const routinesByFolder = useMemo(() => {
    const map = new Map<string | null, RoutineTree[]>();
    map.set(null, []);
    for (const f of folders) map.set(f.id, []);
    for (const r of routines) {
      const key = r.folder_id && map.has(r.folder_id) ? r.folder_id : null;
      map.get(key)!.push(r);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    }
    return map;
  }, [folders, routines]);

  async function handleStartEmpty() {
    if (!store) return;
    if (activeWorkout) {
      setScreen({ kind: "logger", workout: activeWorkout });
      return;
    }
    const created = await startEmptyWorkoutOffline(store, ownerId);
    await reloadLocalState(store, ownerId);
    setScreen({ kind: "logger", workout: created });
  }

  async function handleStartRoutine(routine: RoutineTree) {
    if (!store) return;
    const created = await startWorkoutFromRoutineOffline(store, ownerId, routine);
    await reloadLocalState(store, ownerId);
    setScreen({ kind: "logger", workout: created });
  }

  async function handleCreateFolder() {
    if (!store || !newFolderName.trim()) return;
    await saveRoutineFolderOffline(store, ownerId, { title: newFolderName.trim() });
    setNewFolderName("");
    setNewFolderOpen(false);
    await reloadLocalState(store, ownerId);
    if (navigator.onLine && ownerId !== LOCAL_GUEST_OWNER) void attemptSync(store, ownerId);
  }

  async function handleRenameFolder(folderId: string) {
    if (!store || !renameFolderValue.trim()) return;
    const target = folders.find((f) => f.id === folderId);
    if (!target) return;
    await saveRoutineFolderOffline(store, ownerId, {
      id: target.id,
      title: renameFolderValue.trim(),
      position: target.position,
    });
    setRenamingFolderId(null);
    setRenameFolderValue("");
    await reloadLocalState(store, ownerId);
    if (navigator.onLine && ownerId !== LOCAL_GUEST_OWNER) void attemptSync(store, ownerId);
  }

  async function handleDeleteFolder(folderId: string) {
    if (!store) return;
    await deleteRoutineFolderOffline(store, folderId);
    await reloadLocalState(store, ownerId);
    if (navigator.onLine && ownerId !== LOCAL_GUEST_OWNER) void attemptSync(store, ownerId);
  }

  async function handleMoveRoutineFolder(routine: RoutineTree, nextFolderId: string | null) {
    if (!store) return;
    const dest = routinesByFolder.get(nextFolderId) ?? [];
    await organizeRoutinesOffline(store, [
      { id: routine.id, folder_id: nextFolderId, position: dest.length },
    ]);
    await reloadLocalState(store, ownerId);
    if (navigator.onLine && ownerId !== LOCAL_GUEST_OWNER) void attemptSync(store, ownerId);
  }

  async function handleReorderRoutine(folderId: string | null, index: number, delta: -1 | 1) {
    if (!store) return;
    const list = [...(routinesByFolder.get(folderId) ?? [])];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const [moved] = list.splice(index, 1);
    list.splice(target, 0, moved);
    await organizeRoutinesOffline(
      store,
      list.map((r, pos) => ({ id: r.id, folder_id: folderId, position: pos })),
    );
    await reloadLocalState(store, ownerId);
    if (navigator.onLine && ownerId !== LOCAL_GUEST_OWNER) void attemptSync(store, ownerId);
  }

  async function handleDuplicateRoutine(routine: RoutineTree) {
    if (!store) return;
    await duplicateRoutineOffline(store, ownerId, routine, catalog);
    await reloadLocalState(store, ownerId);
    if (navigator.onLine && ownerId !== LOCAL_GUEST_OWNER) void attemptSync(store, ownerId);
  }

  async function handleDeleteRoutine(routineId: string) {
    if (!store) return;
    await deleteRoutineOffline(store, routineId);
    await reloadLocalState(store, ownerId);
    if (navigator.onLine && ownerId !== LOCAL_GUEST_OWNER) void attemptSync(store, ownerId);
  }

  async function handleImportGuestData() {
    if (!store || ownerId === LOCAL_GUEST_OWNER) return;
    setImportingGuest(true);
    try {
      await claimLocalGuestDataIntoAccount(ownerId);
      setGuestSummary(null);
      setGuestNotice(t("offline.guest.imported"));
      await reloadLocalState(store, ownerId);
      if (navigator.onLine) void attemptSync(store, ownerId);
    } finally {
      setImportingGuest(false);
    }
  }

  async function handleDiscardGuestData() {
    await discardLocalGuestData();
    setGuestSummary(null);
  }

  function resolveExerciseForDetail(idOrSlug: string): OfflineCatalogExercise | undefined {
    return exerciseById.get(idOrSlug) ?? exerciseBySlug.get(idOrSlug);
  }

  if (loading || !store) {
    return (
      <main className="training training-canvas flex min-h-dvh items-center justify-center p-6">
        <p className="training-muted text-sm">{t("common.loading")}</p>
      </main>
    );
  }

  // Full-screen active workout logger (exact same WorkoutLogger component online & offline).
  if (screen.kind === "logger") {
    return (
      <div className="training training-canvas min-h-dvh">
        <WorkoutLogger
          key={screen.workout.id}
          initial={screen.workout}
          userId={ownerId}
          timeZone={timeZone}
          muscles={muscles}
          equipment={equipment}
          library={exercises}
          previous={mergedPrevious}
          recentExerciseIds={recentExerciseIds}
          workouts={completedWorkouts}
          offlineShellMode
          onMinimize={() => {
            void reloadLocalState(store, ownerId);
            setScreen({ kind: "tab", tab: "workout" });
          }}
          onFinishedLocally={(finishedWorkout) => {
            void reloadLocalState(store, ownerId).then(() => {
              if (navigator.onLine && ownerId !== LOCAL_GUEST_OWNER) {
                void attemptSync(store, ownerId);
              }
              setScreen({ kind: "recap", workoutId: finishedWorkout.id, backTo: "home" });
            });
          }}
          onDiscardedLocally={() => {
            void reloadLocalState(store, ownerId).then(() => {
              setScreen({ kind: "tab", tab: "workout" });
            });
          }}
        />
      </div>
    );
  }

  const currentPrimary = activePrimaryTab(screen);
  const pendingCount = syncSnap?.pendingCount ?? 0;
  const isGuest = ownerId === LOCAL_GUEST_OWNER;
  const isAuthRequired = syncSnap?.status === "auth_required";
  const isSyncing = syncSnap?.status === "syncing";
  const displayName = catalog?.profile.displayName?.trim();

  function renderRoutineCard(routine: RoutineTree, index: number, totalInFolder: number, folderId: string | null) {
    const isLocalPending = isGuest || pendingRoutineSet.has(routine.id);
    return (
      <li key={routine.id} className="training-panel flex flex-col rounded-2xl p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 break-words text-base font-semibold">{routine.title}</h3>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              isLocalPending
                ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]"
                : "border-[var(--badge-border)] bg-[var(--badge-bg)] text-[var(--badge-text)]"
            }`}
          >
            {t(isLocalPending ? "offline.badge.local" : "offline.badge.synced")}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {t("common.plural.exercises", { count: routine.exercises.length })}
        </p>
        <p className="mt-1.5 line-clamp-2 break-words text-sm text-[var(--text-muted)]">
          {routine.exercises.length > 0
            ? routine.exercises.map((e) => e.template.title).join(" · ")
            : t("common.workoutHub.noExercises")}
        </p>

        {/* Organization controls: reorder & move between folders */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {folders.length > 0 ? (
            <select
              aria-label={`${t("offline.folders.moveTo")} — ${routine.title}`}
              value={routine.folder_id ?? ""}
              onChange={(e) =>
                void handleMoveRoutineFolder(routine, e.target.value ? e.target.value : null)
              }
              className="training-input min-h-9 min-w-0 flex-1 rounded-lg px-2 text-xs"
            >
              <option value="">{t("offline.folders.default")}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          ) : null}
          {totalInFolder > 1 ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={index === 0}
                aria-label={`${t("offline.folders.moveUp")} ${routine.title}`}
                onClick={() => void handleReorderRoutine(folderId, index, -1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-xs hover:bg-[var(--bg-surface-hover)] disabled:opacity-35"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === totalInFolder - 1}
                aria-label={`${t("offline.folders.moveDown")} ${routine.title}`}
                onClick={() => void handleReorderRoutine(folderId, index, 1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-xs hover:bg-[var(--bg-surface-hover)] disabled:opacity-35"
              >
                ↓
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
          <button
            type="button"
            onClick={() => setScreen({ kind: "routineEditor", routine })}
            className="min-h-11 rounded-xl border border-[var(--border-subtle)] px-3 text-sm font-semibold hover:bg-[var(--bg-surface-hover)]"
          >
            {t("offline.shell.editRoutine")}
          </button>
          <button
            type="button"
            onClick={() => void handleStartRoutine(routine)}
            className="training-elevated min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--accent-text)] hover:bg-[var(--bg-surface-hover)]"
          >
            {t("offline.shell.startRoutine")} →
          </button>
        </div>
        <div className="mt-2 flex items-center justify-end gap-3 text-xs">
          <button
            type="button"
            onClick={() => void handleDuplicateRoutine(routine)}
            className="text-[var(--text-muted)] underline-offset-4 hover:text-[var(--text-primary)] hover:underline"
          >
            {t("routines.duplicate")}
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteRoutine(routine.id)}
            className="text-[var(--danger-text)] underline-offset-4 hover:underline"
          >
            {t("common.delete")}
          </button>
        </div>
      </li>
    );
  }

  function renderWorkoutCard(w: LoggedWorkout, backTo: PrimaryTab | "history") {
    const stats = summarizeWorkout(w);
    const isLocalPending = isGuest || pendingWorkoutSet.has(w.id);
    const earned = dashboard.earnedByWorkoutId.get(w.id) ?? [];
    const preview = w.exercises
      .map((ex) => ({
        title: ex.template.title,
        slug: ex.template.slug,
        completedSets: ex.sets.filter((s) => s.completed_at !== null).length,
      }))
      .filter((e) => e.completedSets > 0)
      .slice(0, 3);

    return (
      <li key={w.id}>
        <button
          type="button"
          onClick={() => setScreen({ kind: "recap", workoutId: w.id, backTo })}
          className="training-panel block w-full rounded-2xl p-4 text-left hover:border-[var(--border-strong)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{w.title}</span>
            <div className="flex items-center gap-1.5">
              {earned.length > 0 ? (
                <span className="rounded-full border border-[var(--badge-border)] bg-[var(--badge-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--badge-text)]">
                  {earned.length} PR
                </span>
              ) : null}
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  isLocalPending
                    ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]"
                    : "border-[var(--badge-border)] bg-[var(--badge-bg)] text-[var(--badge-text)]"
                }`}
              >
                {t(isLocalPending ? "offline.badge.local" : "offline.badge.synced")}
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {formatDateTime(locale, new Date(w.started_at), timeZone)} ·{" "}
            {formatDuration(locale, stats.durationSeconds)} ·{" "}
            {formatVolumeKg(stats.volumeKg, locale)}
          </p>
          {preview.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {preview.map((ex, idx) => (
                <li key={`${ex.slug}-${idx}`} className="flex items-center gap-2.5">
                  <ExerciseThumbnail slug={ex.slug} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{ex.title}</span>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">
                    {t("common.plural.sets", { count: ex.completedSets })}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </button>
      </li>
    );
  }

  return (
    <div className="training training-canvas min-h-dvh pb-[calc(5.5rem+var(--app-safe-bottom))]">
      {/* Top header matching normal Forte + compact offline/sync badge */}
      <header className="sticky top-[var(--app-safe-top)] z-30 border-b border-[var(--border-subtle)] bg-[var(--nav-backdrop)] backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setScreen({ kind: "tab", tab: "home" })}
              className="inline-flex min-h-10 items-center text-lg font-semibold tracking-tight"
            >
              {t("common.appName")}
            </button>
            <span
              className={`truncate rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                !online || pendingCount > 0 || isAuthRequired || isGuest
                  ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]"
                  : "border-[var(--badge-border)] bg-[var(--badge-bg)] text-[var(--badge-text)]"
              }`}
            >
              {isAuthRequired
                ? t("offline.badge.authRequired")
                : isSyncing
                  ? t("offline.badge.syncing")
                  : !online
                    ? t("offline.badge.offlinePill")
                    : isGuest || pendingCount > 0
                      ? t("offline.badge.local")
                      : t("offline.badge.synced")}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {online && isAuthRequired ? (
              <a
                href="/sign-in"
                className="training-action rounded-lg px-2.5 py-1.5 text-xs font-bold"
              >
                {t("offline.status.signInToSync")}
              </a>
            ) : online && !isGuest && pendingCount > 0 ? (
              <button
                type="button"
                disabled={isSyncing}
                onClick={() => void attemptSync(store, ownerId)}
                className="training-action rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-50"
              >
                {t("offline.status.retrySync")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setScreen({ kind: "settings" })}
              aria-label={t("nav.settings")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
            >
              <NavigationIcon name="settings" className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
        {/* Explicit local-only workout association prompt when signed into a cloud account */}
        {guestNotice ? (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-[var(--badge-border)] bg-[var(--badge-bg)] px-4 py-2.5 text-xs font-medium text-[var(--badge-text)]">
            <span>{guestNotice}</span>
            <button type="button" onClick={() => setGuestNotice(null)} className="px-1">
              ✕
            </button>
          </div>
        ) : null}

        {!isGuest && guestSummary?.hasAny && !guestDismissed ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--text-primary)]">
                {t("offline.guest.bannerTitle")}
              </p>
              <p className="mt-1 text-[var(--text-muted)]">
                {t("offline.guest.bannerBody", {
                  workouts: guestSummary.workoutCount,
                  routines: guestSummary.routineCount,
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={importingGuest}
                onClick={() => void handleImportGuestData()}
                className="training-action min-h-10 rounded-xl px-3 font-bold disabled:opacity-50"
              >
                {importingGuest ? t("offline.guest.importing") : t("offline.guest.import")}
              </button>
              <button
                type="button"
                onClick={() => setGuestDismissed(true)}
                className="min-h-10 rounded-xl border border-[var(--border-subtle)] px-3 font-semibold"
              >
                {t("offline.guest.keepSeparate")}
              </button>
              <button
                type="button"
                onClick={() => void handleDiscardGuestData()}
                className="min-h-10 rounded-xl px-2.5 font-semibold text-[var(--danger-text)]"
              >
                {t("offline.guest.discard")}
              </button>
            </div>
          </div>
        ) : null}

        {/* SCREEN ROUTING */}
        {screen.kind === "routineEditor" ? (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-2xl font-semibold">
                {screen.routine ? t("routines.edit") : t("routines.create")}
              </h1>
            </div>
            <RoutineEditor
              library={exercises}
              muscles={muscles}
              equipment={equipment}
              initial={screen.routine}
              folders={folders}
              initialFolderId={screen.initialFolderId}
              recentExerciseIds={recentExerciseIds}
              workouts={completedWorkouts}
              timeZone={timeZone}
              onCancel={() => setScreen({ kind: "tab", tab: "workout" })}
              onSaveOverride={async (input) => {
                const saved = await saveRoutineOffline(store, ownerId, input, catalog);
                await reloadLocalState(store, ownerId);
                if (navigator.onLine && !isGuest) {
                  void attemptSync(store, ownerId);
                }
                setScreen({ kind: "tab", tab: "workout" });
                return { id: saved.id };
              }}
            />
          </section>
        ) : screen.kind === "recap" ? (
          (() => {
            const workout = workouts.find((w) => w.id === screen.workoutId);
            if (!workout) {
              return (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setScreen({ kind: "tab", tab: "home" })}
                    className="text-sm text-[var(--accent-text)]"
                  >
                    ← {t("workouts.detail.back")}
                  </button>
                  <p className="text-sm text-[var(--text-muted)]">{t("offline.shell.historyEmpty")}</p>
                </div>
              );
            }
            return (
              <OfflineWorkoutDetail
                workout={workout}
                pending={isGuest || pendingWorkoutSet.has(workout.id)}
                earnedRecords={dashboard.earnedByWorkoutId.get(workout.id) ?? []}
                timeZone={timeZone}
                onBack={() =>
                  setScreen(
                    screen.backTo === "history"
                      ? { kind: "history" }
                      : { kind: "tab", tab: screen.backTo },
                  )
                }
                onOpenExercise={(templateId) => {
                  const ex = resolveExerciseForDetail(templateId);
                  if (ex) {
                    setScreen({
                      kind: "exerciseDetail",
                      exerciseId: ex.id,
                      backTo: "recap",
                      backWorkoutId: workout.id,
                    });
                  }
                }}
              />
            );
          })()
        ) : screen.kind === "exerciseDetail" ? (
          (() => {
            const ex = resolveExerciseForDetail(screen.exerciseId);
            if (!ex) {
              return (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setScreen({ kind: "exercises" })}
                    className="text-sm text-[var(--accent-text)]"
                  >
                    ← {t("nav.exercises")}
                  </button>
                  <p className="text-sm text-[var(--text-muted)]">{t("training.picker.empty")}</p>
                </div>
              );
            }
            return (
              <ExerciseDetailView
                exercise={ex}
                muscles={muscles}
                equipment={equipment}
                workouts={completedWorkouts}
                timeZone={timeZone}
                initialTab={screen.initialTab ?? "how-to"}
                onBack={() => {
                  if (screen.backTo === "recap" && screen.backWorkoutId) {
                    setScreen({ kind: "recap", workoutId: screen.backWorkoutId, backTo: "home" });
                  } else if (screen.backTo === "exercises") {
                    setScreen({ kind: "exercises" });
                  } else if (screen.backTo === "progress") {
                    setScreen({ kind: "progress", selectedExerciseId: ex.id });
                  } else if (screen.backTo !== "recap") {
                    setScreen({ kind: "tab", tab: screen.backTo });
                  } else {
                    setScreen({ kind: "tab", tab: "home" });
                  }
                }}
                onOpenWorkout={(workoutId) =>
                  setScreen({ kind: "recap", workoutId, backTo: "history" })
                }
              />
            );
          })()
        ) : screen.kind === "exercises" ? (
          <section className="space-y-4">
            <header className="flex items-center justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={() => setScreen({ kind: "tab", tab: "profile" })}
                  className="mb-1 inline-flex items-center text-xs font-semibold text-[var(--accent-text)]"
                >
                  ← {t("nav.profile")}
                </button>
                <h1 className="text-2xl font-semibold tracking-tight">{t("nav.exercises")}</h1>
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                {formatNumber(locale, filteredExercises.length)}
              </span>
            </header>

            <div className="space-y-2">
              <input
                type="search"
                value={exQuery}
                onChange={(e) => setExQuery(e.target.value)}
                placeholder={t("training.picker.search")}
                className="training-input min-h-11 w-full rounded-xl px-3 text-base"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label={t("training.picker.muscle")}
                  value={exMuscle}
                  onChange={(e) => setExMuscle(e.target.value)}
                  className="training-input min-h-11 w-full rounded-xl px-2 text-base"
                >
                  <option value="">{t("training.picker.muscle")}</option>
                  {muscles.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("training.picker.equipment")}
                  value={exEquipment}
                  onChange={(e) => setExEquipment(e.target.value)}
                  className="training-input min-h-11 w-full rounded-xl px-2 text-base"
                >
                  <option value="">{t("training.picker.equipment")}</option>
                  {equipment.map((eq) => (
                    <option key={eq.code} value={eq.code}>
                      {eq.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {recentExercises.length > 0 ? (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {t("offline.picker.recent")}
                </h2>
                <ul className="space-y-2">
                  {recentExercises.map((ex) => (
                    <li key={`recent-${ex.id}`}>
                      <button
                        type="button"
                        onClick={() =>
                          setScreen({
                            kind: "exerciseDetail",
                            exerciseId: ex.id,
                            backTo: "exercises",
                          })
                        }
                        className="training-panel flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:border-[var(--border-strong)]"
                      >
                        <ExerciseThumbnail slug={ex.slug} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-semibold">{ex.title}</span>
                          <span className="block text-xs text-[var(--text-muted)]">
                            {muscleNames.get(ex.primary_muscle) ?? ex.primary_muscle}
                          </span>
                        </span>
                        <span aria-hidden="true" className="text-[var(--text-muted)]">→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {filteredExercises.length === 0 ? (
              <p className="training-panel rounded-2xl border-dashed p-5 text-sm text-[var(--text-muted)]">
                {t("training.picker.emptyFiltered")}
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredExercises.slice(0, 150).map((ex) => (
                  <li key={ex.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setScreen({
                          kind: "exerciseDetail",
                          exerciseId: ex.id,
                          backTo: "exercises",
                        })
                      }
                      className="training-panel flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:border-[var(--border-strong)]"
                    >
                      <ExerciseThumbnail slug={ex.slug} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-semibold">{ex.title}</span>
                        <span className="block text-xs text-[var(--text-muted)]">
                          {muscleNames.get(ex.primary_muscle) ?? ex.primary_muscle}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-[var(--text-muted)]">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : screen.kind === "progress" ? (
          (() => {
            const performedIds = recentExerciseIds.filter((id) => exerciseById.has(id));
            const selectedId =
              screen.selectedExerciseId ?? performedIds[0] ?? exercises[0]?.id ?? "";
            const selectedEx = selectedId ? exerciseById.get(selectedId) : undefined;
            return (
              <section className="space-y-5">
                <header>
                  <button
                    type="button"
                    onClick={() => setScreen({ kind: "tab", tab: "profile" })}
                    className="mb-1 inline-flex items-center text-xs font-semibold text-[var(--accent-text)]"
                  >
                    ← {t("nav.profile")}
                  </button>
                  <h1 className="text-2xl font-semibold tracking-tight">{t("nav.progress")}</h1>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{t("progress.intro")}</p>
                </header>

                {exercises.length > 0 ? (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {t("nav.exercises")}
                    </span>
                    <select
                      value={selectedId}
                      onChange={(e) =>
                        setScreen({ kind: "progress", selectedExerciseId: e.target.value })
                      }
                      className="training-input min-h-11 w-full rounded-xl px-3 text-base"
                    >
                      {performedIds.length > 0 ? (
                        <optgroup label={t("offline.picker.recent")}>
                          {performedIds.map((id) => {
                            const ex = exerciseById.get(id)!;
                            return (
                              <option key={`p-${ex.id}`} value={ex.id}>
                                {ex.title}
                              </option>
                            );
                          })}
                        </optgroup>
                      ) : null}
                      <optgroup label={t("offline.picker.all")}>
                        {exercises.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.title}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                ) : null}

                {selectedEx ? (
                  <ExerciseDetailView
                    key={selectedEx.id}
                    exercise={selectedEx}
                    muscles={muscles}
                    equipment={equipment}
                    workouts={completedWorkouts}
                    timeZone={timeZone}
                    initialTab="statistics"
                    onOpenWorkout={(workoutId) =>
                      setScreen({ kind: "recap", workoutId, backTo: "history" })
                    }
                  />
                ) : (
                  <p className="training-panel rounded-2xl border-dashed p-5 text-sm text-[var(--text-muted)]">
                    {t("progress.empty")}
                  </p>
                )}
              </section>
            );
          })()
        ) : screen.kind === "history" ? (
          <section className="space-y-5">
            <header>
              <button
                type="button"
                onClick={() => setScreen({ kind: "tab", tab: "home" })}
                className="mb-1 inline-flex items-center text-xs font-semibold text-[var(--accent-text)]"
              >
                ← {t("nav.home")}
              </button>
              <h1 className="text-2xl font-semibold tracking-tight">{t("nav.history")}</h1>
            </header>
            {completedWorkouts.length === 0 ? (
              <p className="training-panel rounded-2xl border-dashed p-6 text-sm text-[var(--text-muted)]">
                {t("offline.shell.historyEmpty")}
              </p>
            ) : (
              <ul className="space-y-3">
                {completedWorkouts.map((w) => renderWorkoutCard(w, "history"))}
              </ul>
            )}
          </section>
        ) : screen.kind === "settings" ? (
          <section className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={() => setScreen({ kind: "tab", tab: "profile" })}
                  className="mb-1 inline-flex items-center text-xs font-semibold text-[var(--accent-text)]"
                >
                  ← {t("nav.profile")}
                </button>
                <h1 className="text-2xl font-semibold tracking-tight">{t("nav.settings")}</h1>
              </div>
              <LanguageSwitcher compact />
            </header>

            <DevicePreferences userId={ownerId} />

            {/* Cloud sync & account status (clearly separated from offline training preferences) */}
            <section className="training-panel space-y-3 rounded-2xl p-5">
              <h2 className="text-base font-semibold">{t("nav.account")}</h2>
              {isGuest ? (
                <>
                  <p className="text-sm text-[var(--text-muted)]">
                    {t("offline.fresh.localNotice")}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      window.location.assign(new URL("/sign-in", window.location.origin).href)
                    }
                    className="training-action min-h-11 w-full rounded-xl px-4 text-sm font-bold"
                  >
                    {t("offline.fresh.connect")}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-[var(--text-muted)]">
                    {catalog?.profile.email || catalog?.profile.displayName} ·{" "}
                    {pendingCount > 0
                      ? t("offline.status.pendingCount", { count: pendingCount })
                      : t("offline.status.allSynced")}
                  </p>
                  {online ? (
                    <div className="flex flex-wrap gap-2">
                      {pendingCount > 0 ? (
                        <button
                          type="button"
                          disabled={isSyncing}
                          onClick={() => void attemptSync(store, ownerId)}
                          className="training-action min-h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-50"
                        >
                          {t("offline.status.retrySync")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          window.location.assign(new URL("/account", window.location.origin).href)
                        }
                        className="min-h-11 rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold hover:bg-[var(--bg-surface-hover)]"
                      >
                        {t("offline.status.backOnline")}
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-xs text-[var(--warning-text)]">
                      <p className="font-semibold">{t("account.offline.banner")}</p>
                      <p className="mt-1 opacity-90">{t("account.offline.requiresConnection")}</p>
                    </div>
                  )}
                </>
              )}
            </section>
          </section>
        ) : currentPrimary === "home" ? (
          /* HOME TAB — mirrors Forte Dashboard (app/(app)/page.tsx) */
          <section className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
                <p className="mt-1 break-words text-sm text-[var(--text-muted)]">
                  {displayName && !isGuest
                    ? t("dashboard.greeting.named", { name: displayName })
                    : t("dashboard.greeting.guest")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setScreen({ kind: "history" })}
                  className="training-panel inline-flex min-h-10 items-center rounded-xl px-3.5 text-sm font-medium hover:border-[var(--border-strong)]"
                >
                  {t("nav.history")}
                </button>
                <button
                  type="button"
                  onClick={() => setScreen({ kind: "progress" })}
                  className="training-panel inline-flex min-h-10 items-center rounded-xl px-3.5 text-sm font-medium hover:border-[var(--border-strong)]"
                >
                  {t("dashboard.viewProgress")}
                </button>
              </div>
            </header>

            {/* Hero + 7-day activity grid */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <section className="training-hero flex flex-col justify-between rounded-2xl p-5">
                <div>
                  <p className="training-hero-muted text-xs font-semibold uppercase tracking-widest">
                    {t(
                      activeWorkout
                        ? "dashboard.hero.eyebrowActive"
                        : "dashboard.hero.eyebrowIdle",
                    )}
                  </p>
                  <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight">
                    {activeWorkout ? activeWorkout.title : t("dashboard.hero.titleIdle")}
                  </h2>
                  <p className="training-hero-muted mt-2 text-sm leading-relaxed">
                    {t(activeWorkout ? "dashboard.hero.bodyActive" : "dashboard.hero.bodyIdle")}
                  </p>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {activeWorkout ? (
                    <button
                      type="button"
                      onClick={() => setScreen({ kind: "logger", workout: activeWorkout })}
                      className="training-action inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-bold"
                    >
                      {t("dashboard.hero.resume")} →
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleStartEmpty()}
                      className="training-action inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-bold"
                    >
                      {t("dashboard.hero.startEmpty")} →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setScreen({ kind: "tab", tab: "workout" })}
                    className="training-hero-muted inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium underline underline-offset-4"
                  >
                    {t("dashboard.hero.chooseRoutine")}
                  </button>
                </div>
              </section>

              {/* 7-day Activity & Weekly Totals */}
              <section className="training-panel rounded-2xl p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold">{t("dashboard.activity.title")}</h2>
                  <span className="text-xs text-[var(--text-muted)]">
                    {dashboard.activityDays[0]?.label} – {dashboard.activityDays[6]?.label}
                  </span>
                </div>
                <ol className="mt-3 grid grid-cols-7 gap-1">
                  {dashboard.activityDays.map((day) => (
                    <li
                      key={day.date.toISOString()}
                      className={`flex flex-col items-center rounded-lg py-1.5 ${
                        day.today ? "bg-[var(--bg-surface-elevated)]" : ""
                      }`}
                    >
                      <span className="text-[10px] font-medium text-[var(--text-muted)]">
                        {day.weekday}
                      </span>
                      <span
                        className={`mt-1.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                          day.count > 0
                            ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                            : "bg-[var(--bg-canvas)] text-[var(--text-muted)]"
                        }`}
                      >
                        {day.count > 0 ? formatNumber(locale, day.count) : "–"}
                      </span>
                      <span className="mt-1 text-[10px] text-[var(--text-muted)]">
                        {day.today ? t("common.today") : day.dayOfMonth}
                      </span>
                    </li>
                  ))}
                </ol>
                <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-[var(--border-subtle)] pt-3 text-center">
                  <div>
                    <dt className="text-[11px] text-[var(--text-muted)]">
                      {t("dashboard.metric.workouts")}
                    </dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                      {formatNumber(locale, dashboard.weekTotals.workouts)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-[var(--text-muted)]">
                      {t("dashboard.metric.sets")}
                    </dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                      {formatNumber(locale, dashboard.weekTotals.sets)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-[var(--text-muted)]">
                      {t("dashboard.metric.volume")}
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                      {formatNumber(locale, Math.round(dashboard.weekTotals.volumeKg))}{" "}
                      {t("common.unit.kg")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-[var(--text-muted)]">
                      {t("dashboard.metric.records")}
                    </dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                      {formatNumber(locale, dashboard.weekTotals.records)}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            {/* Quick start routines */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{t("dashboard.quickStart.title")}</h2>
                <button
                  type="button"
                  onClick={() => setScreen({ kind: "tab", tab: "workout" })}
                  className="text-sm font-medium text-[var(--accent-text)] underline underline-offset-4"
                >
                  {t("dashboard.quickStart.allRoutines")}
                </button>
              </div>
              {routines.length === 0 ? (
                <div className="training-panel rounded-2xl border-dashed p-5">
                  <h3 className="font-semibold">{t("dashboard.quickStart.emptyTitle")}</h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {t("dashboard.quickStart.emptyBody")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setScreen({ kind: "routineEditor" })}
                    className="training-action mt-3 min-h-11 rounded-xl px-4 text-sm font-bold"
                  >
                    + {t("dashboard.quickStart.emptyCta")}
                  </button>
                </div>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {routines.slice(0, 4).map((routine) => (
                    <li key={routine.id} className="training-panel flex flex-col rounded-2xl p-4">
                      <h3 className="font-semibold">{routine.title}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                        {routine.exercises.length > 0
                          ? routine.exercises.map((e) => e.template.title).join(" · ")
                          : t("common.workoutHub.noExercises")}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleStartRoutine(routine)}
                        className="training-elevated mt-3 min-h-11 w-full rounded-xl px-3 text-sm font-semibold text-[var(--accent-text)]"
                      >
                        {t("dashboard.quickStart.start")} →
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Recent Workouts */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{t("dashboard.recent.title")}</h2>
                {completedWorkouts.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setScreen({ kind: "history" })}
                    className="text-sm font-medium text-[var(--accent-text)] underline underline-offset-4"
                  >
                    {t("dashboard.recent.all")}
                  </button>
                ) : null}
              </div>
              {completedWorkouts.length === 0 ? (
                <p className="training-panel rounded-2xl border-dashed p-5 text-sm text-[var(--text-muted)]">
                  {t("offline.shell.historyEmpty")}
                </p>
              ) : (
                <ul className="space-y-3">
                  {completedWorkouts.slice(0, 5).map((w) => renderWorkoutCard(w, "home"))}
                </ul>
              )}
            </section>

            {/* Recent Personal Records */}
            {dashboard.recentRecords.length > 0 ? (
              <section className="training-panel rounded-2xl p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold">{t("dashboard.records.title")}</h2>
                  <span className="text-xs text-[var(--text-muted)]">
                    {t("dashboard.records.subtitle")}
                  </span>
                </div>
                <ul className="mt-2 divide-y divide-[var(--border-subtle)]">
                  {dashboard.recentRecords.slice(0, 5).map((rec) => (
                    <li
                      key={`${rec.workoutId}:${rec.templateId}:${rec.category}`}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setScreen({
                            kind: "exerciseDetail",
                            exerciseId: rec.templateId,
                            initialTab: "statistics",
                            backTo: "home",
                          })
                        }
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-xs font-semibold text-[var(--accent-text)]">
                          {recordCategoryLabel(rec.category, locale)}
                        </p>
                        <p className="truncate text-sm font-semibold">{rec.exerciseTitle}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {formatDateTime(locale, rec.startedAt, timeZone)}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setScreen({ kind: "recap", workoutId: rec.workoutId, backTo: "home" })
                        }
                        className="shrink-0 text-xs font-medium text-[var(--text-muted)] underline underline-offset-4"
                      >
                        {t("dashboard.records.viewWorkout")}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        ) : currentPrimary === "workout" ? (
          /* WORKOUT TAB — Start empty + Routines & Folders + Reorder */
          <section className="space-y-6">
            <header>
              <h1 className="text-3xl font-semibold tracking-tight">{t("nav.workout")}</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {t("common.workoutHub.subtitle")}
              </p>
            </header>

            {activeWorkout ? (
              <button
                type="button"
                onClick={() => setScreen({ kind: "logger", workout: activeWorkout })}
                className="training-elevated flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent-text)]"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-[var(--accent-text)]">
                    {t("common.workoutHub.resume")}
                  </span>
                  <span className="block truncate text-sm font-semibold">
                    {activeWorkout.title}
                  </span>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void handleStartEmpty()}
              className="training-action flex min-h-16 w-full items-center gap-3 rounded-2xl px-5 py-4 text-left"
            >
              <NavigationIcon name="workout" className="h-7 w-7 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">
                  {t("common.workoutHub.startEmpty")}
                </span>
                <span className="mt-0.5 block text-sm opacity-85">
                  {t("common.workoutHub.startHint")}
                </span>
              </span>
              <span aria-hidden="true" className="text-xl">+</span>
            </button>

            {/* Routines header + create routine / create folder */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-semibold">{t("common.workoutHub.routines")}</h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNewFolderOpen((v) => !v)}
                    className="min-h-10 rounded-xl border border-[var(--border-subtle)] px-3 text-xs font-semibold hover:bg-[var(--bg-surface)]"
                  >
                    + {t("offline.folders.new")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreen({ kind: "routineEditor" })}
                    className="training-action min-h-10 rounded-xl px-3.5 text-xs font-bold"
                  >
                    + {t("common.workoutHub.create")}
                  </button>
                </div>
              </div>

              {newFolderOpen ? (
                <div className="training-panel flex gap-2 rounded-2xl p-3">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder={t("offline.folders.placeholder")}
                    maxLength={80}
                    className="training-input min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateFolder()}
                    className="training-action min-h-11 rounded-xl px-4 text-sm font-bold"
                  >
                    {t("common.save")}
                  </button>
                </div>
              ) : null}

              {/* User folders */}
              {folders.map((folder) => {
                const list = routinesByFolder.get(folder.id) ?? [];
                const collapsed = collapsedFolders.has(folder.id);
                return (
                  <section key={folder.id} className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2">
                      {renamingFolderId === folder.id ? (
                        <div className="flex flex-1 items-center gap-2">
                          <input
                            type="text"
                            value={renameFolderValue}
                            onChange={(e) => setRenameFolderValue(e.target.value)}
                            className="training-input min-h-9 min-w-0 flex-1 rounded-lg px-2.5 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => void handleRenameFolder(folder.id)}
                            className="training-action min-h-9 rounded-lg px-3 text-xs font-bold"
                          >
                            {t("common.save")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingFolderId(null)}
                            className="min-h-9 px-2 text-xs text-[var(--text-muted)]"
                          >
                            {t("common.cancel")}
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedFolders((prev) => {
                                const next = new Set(prev);
                                if (next.has(folder.id)) next.delete(folder.id);
                                else next.add(folder.id);
                                return next;
                              })
                            }
                            className="flex min-h-9 items-center gap-2 text-left text-sm font-semibold"
                          >
                            <span>{collapsed ? "▸" : "▾"}</span>
                            <span>{folder.title}</span>
                            <span className="text-xs font-normal text-[var(--text-muted)]">
                              ({list.length})
                            </span>
                          </button>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() =>
                                setScreen({ kind: "routineEditor", initialFolderId: folder.id })
                              }
                              className="text-[var(--accent-text)] font-semibold"
                            >
                              + {t("common.add")}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingFolderId(folder.id);
                                setRenameFolderValue(folder.title);
                              }}
                              className="text-[var(--text-muted)]"
                            >
                              {t("offline.folders.rename")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteFolder(folder.id)}
                              className="text-[var(--danger-text)]"
                            >
                              {t("common.delete")}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {!collapsed ? (
                      list.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-3 text-xs text-[var(--text-muted)]">
                          {t("common.workoutHub.empty")}
                        </p>
                      ) : (
                        <ul className="grid gap-3 md:grid-cols-2">
                          {list.map((r, idx) =>
                            renderRoutineCard(r, idx, list.length, folder.id),
                          )}
                        </ul>
                      )
                    ) : null}
                  </section>
                );
              })}

              {/* Default unfiled routines */}
              {(() => {
                const unfiled = routinesByFolder.get(null) ?? [];
                if (routines.length === 0) {
                  return (
                    <p className="training-panel rounded-2xl border-dashed p-5 text-sm text-[var(--text-muted)]">
                      {t("common.workoutHub.empty")}
                    </p>
                  );
                }
                if (unfiled.length === 0 && folders.length > 0) return null;
                return (
                  <section className="space-y-2.5">
                    {folders.length > 0 ? (
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        {t("offline.folders.default")} ({unfiled.length})
                      </h3>
                    ) : null}
                    <ul className="grid gap-3 md:grid-cols-2">
                      {unfiled.map((r, idx) => renderRoutineCard(r, idx, unfiled.length, null))}
                    </ul>
                  </section>
                );
              })()}
            </div>
          </section>
        ) : (
          /* PROFILE TAB — mirrors app/(app)/profile/page.tsx hub */
          <section className="space-y-6">
            <header>
              <h1 className="text-3xl font-semibold tracking-tight">{t("nav.profile")}</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {t("common.profileHub.subtitle")}
              </p>
            </header>

            <dl className="grid grid-cols-3 gap-2.5">
              <div className="training-panel rounded-2xl p-3.5 text-center">
                <dt className="text-xs text-[var(--text-muted)]">
                  {t("dashboard.metric.workouts")}
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {formatNumber(locale, completedWorkouts.length)}
                </dd>
              </div>
              <div className="training-panel rounded-2xl p-3.5 text-center">
                <dt className="text-xs text-[var(--text-muted)]">
                  {t("common.workoutHub.routines")}
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {formatNumber(locale, routines.length)}
                </dd>
              </div>
              <div className="training-panel rounded-2xl p-3.5 text-center">
                <dt className="text-xs text-[var(--text-muted)]">
                  {t("dashboard.metric.records")}
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {formatNumber(locale, dashboard.recentRecords.length)}
                </dd>
              </div>
            </dl>

            <ul className="space-y-3">
              {(
                [
                  {
                    target: { kind: "progress" } as AppScreen,
                    title: "nav.progress" as const,
                    description: "common.profileHub.progress" as const,
                    icon: "progress" as NavigationIconName,
                  },
                  {
                    target: { kind: "exercises" } as AppScreen,
                    title: "nav.exercises" as const,
                    description: "common.profileHub.exercises" as const,
                    icon: "exercises" as NavigationIconName,
                  },
                  {
                    target: { kind: "history" } as AppScreen,
                    title: "nav.history" as const,
                    description: "common.profileHub.history" as const,
                    icon: "history" as NavigationIconName,
                  },
                  {
                    target: { kind: "settings" } as AppScreen,
                    title: "nav.settings" as const,
                    description: "common.profileHub.settings" as const,
                    icon: "settings" as NavigationIconName,
                  },
                ]
              ).map((item) => (
                <li key={item.title}>
                  <button
                    type="button"
                    onClick={() => setScreen(item.target)}
                    className="training-panel flex min-h-20 w-full items-center gap-4 rounded-2xl p-4 text-left hover:border-[var(--border-strong)]"
                  >
                    <NavigationIcon
                      name={item.icon}
                      className="h-6 w-6 shrink-0 text-[var(--accent-text)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold">{t(item.title)}</span>
                      <span className="mt-0.5 block break-words text-sm text-[var(--text-muted)]">
                        {t(item.description)}
                      </span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-[var(--text-muted)]">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* Persistent 3-tab Bottom Navigation matching Forte's online BottomNav */}
      <nav
        aria-label={t("nav.primary")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--nav-backdrop)] pb-[var(--app-safe-bottom)] pl-[var(--app-safe-left)] pr-[var(--app-safe-right)] backdrop-blur"
      >
        <ul className="mx-auto grid max-w-md grid-cols-3">
          {(
            [
              { tab: "home", label: "nav.home", icon: "home" },
              { tab: "workout", label: "nav.workout", icon: "workout" },
              { tab: "profile", label: "nav.profile", icon: "profile" },
            ] as const
          ).map(({ tab, label, icon }) => {
            const active = currentPrimary === tab;
            return (
              <li key={tab}>
                <button
                  type="button"
                  onClick={() => setScreen({ kind: "tab", tab })}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 px-2 py-2 text-xs font-medium ${
                    active ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  <NavigationIcon name={icon} className="h-6 w-6" />
                  <span className="max-w-full truncate">{t(label)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function OfflineWorkoutDetail({
  workout,
  pending,
  earnedRecords,
  timeZone,
  onBack,
  onOpenExercise,
}: {
  workout: LoggedWorkout;
  pending: boolean;
  earnedRecords: LocalEarnedRecord[];
  timeZone: string;
  onBack: () => void;
  onOpenExercise: (templateId: string) => void;
}) {
  const { locale, t } = useI18n();
  const stats = summarizeWorkout(workout);
  const recordsByTemplate = useMemo(() => {
    const map = new Map<string, LocalEarnedRecord[]>();
    for (const r of earnedRecords) {
      const list = map.get(r.templateId) ?? [];
      list.push(r);
      map.set(r.templateId, list);
    }
    return map;
  }, [earnedRecords]);

  const performed = workout.exercises
    .map((exercise) => ({
      exercise,
      sets: exercise.sets.filter((s) => s.completed_at !== null),
    }))
    .filter((entry) => entry.sets.length > 0);

  return (
    <section className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-[var(--accent-text)] hover:bg-[var(--bg-surface)]"
      >
        ← {t("workouts.detail.back")}
      </button>

      <header>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
            pending
              ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]"
              : "border-[var(--badge-border)] bg-[var(--badge-bg)] text-[var(--badge-text)]"
          }`}
        >
          ✓ {t(pending ? "offline.badge.local" : "offline.badge.synced")}
        </span>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{workout.title}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {formatDateTime(locale, new Date(workout.started_at), timeZone)}
        </p>
        {pending ? (
          <p className="mt-2 text-xs text-[var(--warning-text)]">
            {t("offline.shell.savedLocalFinish")}
          </p>
        ) : null}
      </header>

      <dl className="grid grid-cols-3 gap-3">
        <div className="training-panel rounded-2xl p-4">
          <dt className="text-xs text-[var(--text-muted)]">{t("workouts.metric.duration")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">
            {formatDuration(locale, stats.durationSeconds)}
          </dd>
        </div>
        <div className="training-panel rounded-2xl p-4">
          <dt className="text-xs text-[var(--text-muted)]">{t("workouts.recap.completedSets")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">
            {formatNumber(locale, stats.completedSets)}
          </dd>
        </div>
        <div className="training-panel rounded-2xl p-4">
          <dt className="text-xs text-[var(--text-muted)]">{t("workouts.metric.volume")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">
            {formatVolumeKg(stats.volumeKg, locale)}
          </dd>
        </div>
      </dl>

      {workout.notes ? (
        <div className="training-panel rounded-2xl p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {t("workouts.recap.notes")}
          </h2>
          <p className="mt-1.5 whitespace-pre-wrap text-sm">{workout.notes}</p>
        </div>
      ) : null}

      <ul className="space-y-3">
        {performed.map(({ exercise, sets }) => {
          const exRecords = recordsByTemplate.get(exercise.template_id) ?? [];
          return (
            <li key={exercise.id} className="training-panel rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <ExerciseThumbnail slug={exercise.template.slug} size="md" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onOpenExercise(exercise.template_id)}
                    className="break-words text-left font-semibold hover:text-[var(--accent-text)] hover:underline"
                  >
                    {exercise.template.title} ↗
                  </button>
                  <p className="text-xs text-[var(--text-muted)]">
                    {t("workouts.recap.setsCompleted", { count: sets.length })}
                  </p>
                  {exRecords.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {exRecords.map((rec) => (
                        <span
                          key={rec.category}
                          className="rounded-full border border-[var(--badge-border)] bg-[var(--badge-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--badge-text)]"
                        >
                          PR · {recordCategoryLabel(rec.category, locale)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              {exercise.notes ? (
                <p className="mt-2.5 text-xs text-[var(--text-muted)]">{exercise.notes}</p>
              ) : null}
              <ol className="mt-3 divide-y divide-[var(--border-subtle)] text-sm">
                {sets.map((s, idx) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="text-xs font-semibold text-[var(--text-muted)]">
                      #{idx + 1}
                      {s.set_type !== "normal" ? ` · ${s.set_type}` : ""}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatSetValues(s, exercise.template.exercise_type, locale)}
                      {s.rpe ? ` · RPE ${s.rpe}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
