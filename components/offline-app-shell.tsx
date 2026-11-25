"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RoutineTree } from "@/schema/types";
import type { LoggedWorkout } from "@/lib/workout-sync";
import {
  LOCAL_GUEST_OWNER,
  openExistingOfflineStore,
  openOfflineStore,
  type OfflineCatalogSnapshot,
  type OfflineStore,
} from "@/lib/offline-store";
import {
  flushOfflineQueue,
  readOfflineSyncSnapshot,
  refreshOfflineBootstrap,
  saveRoutineOffline,
  startEmptyWorkoutOffline,
  startWorkoutFromRoutineOffline,
  type OfflineSyncSnapshot,
} from "@/lib/offline-sync";
import { formatSetValues, formatVolumeKg, summarizeWorkout } from "@/lib/workout-stats";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/context";
import { NavigationIcon } from "@/components/bottom-nav";
import { DevicePreferences } from "@/components/device-preferences";
import { ExerciseThumbnail } from "@/components/exercise-media";
import { RoutineEditor } from "@/components/routine-editor";
import { WorkoutLogger } from "@/components/workout-logger";

type OfflineTab = "home" | "workout" | "exercises" | "settings";

type OfflineScreen =
  | { kind: "tab"; tab: OfflineTab }
  | { kind: "logger"; workout: LoggedWorkout }
  | { kind: "routineEditor"; routine?: RoutineTree }
  | { kind: "recap"; workout: LoggedWorkout };

function initialTabFromPath(): OfflineTab {
  if (typeof window === "undefined") return "home";
  const path = window.location.pathname;
  if (path.startsWith("/workout") && !path.startsWith("/workouts")) return "workout";
  if (path.startsWith("/routines")) return "workout";
  if (path.startsWith("/exercises")) return "exercises";
  if (path.startsWith("/profile") || path.startsWith("/account")) return "settings";
  return "home";
}

export function OfflineAppShell() {
  const { locale, t } = useI18n();
  const [loading, setLoading] = useState(true);
  // Start conservatively offline until a live server probe/sync succeeds, because
  // Android WebView can still report `navigator.onLine === true` right after airplane mode.
  const [online, setOnline] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [store, setStore] = useState<OfflineStore | null>(null);
  const [catalog, setCatalog] = useState<OfflineCatalogSnapshot | undefined>(undefined);
  const [routines, setRoutines] = useState<RoutineTree[]>([]);
  const [workouts, setWorkouts] = useState<LoggedWorkout[]>([]);
  const [syncSnap, setSyncSnap] = useState<OfflineSyncSnapshot | null>(null);
  const [screen, setScreen] = useState<OfflineScreen>({ kind: "tab", tab: "home" });

  // Exercises tab filter state
  const [exQuery, setExQuery] = useState("");
  const [exMuscle, setExMuscle] = useState("");
  const [exEquipment, setExEquipment] = useState("");
  const [expandedExId, setExpandedExId] = useState<string | null>(null);

  const reloadLocalState = useCallback(async (activeStore: OfflineStore) => {
    const [cat, rList, wList, snap] = await Promise.all([
      activeStore.readCatalog(),
      activeStore.listRoutines(),
      activeStore.listWorkouts(),
      readOfflineSyncSnapshot(activeStore),
    ]);
    setCatalog(cat);
    setRoutines(rList);
    setWorkouts(wList);
    setSyncSnap(snap);
    return { cat, rList, wList, snap };
  }, []);

  const attemptSync = useCallback(
    async (activeStore: OfflineStore) => {
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
        await reloadLocalState(activeStore);
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
        const existing = await openExistingOfflineStore();
        if (!active) return;
        if (!existing) {
          setOwnerId(null);
          setStore(null);
          setLoading(false);
          return;
        }
        setOwnerId(existing.ownerId);
        setStore(existing.store);
        const { wList } = await reloadLocalState(existing.store);
        if (!active) return;

        // If launched on a specific workout URL that is active locally, open the logger directly.
        const path = window.location.pathname;
        const match = /^\/workouts\/([0-9a-f-]{36})$/i.exec(path);
        if (match) {
          const found = wList.find((w) => w.id === match[1]);
          if (found) {
            setScreen(found.ended_at === null ? { kind: "logger", workout: found } : { kind: "recap", workout: found });
            setLoading(false);
            return;
          }
        }
        setScreen({ kind: "tab", tab: initialTabFromPath() });
        setLoading(false);

        if (navigator.onLine && existing.ownerId !== LOCAL_GUEST_OWNER) {
          void attemptSync(existing.store);
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
      if (store && ownerId && ownerId !== LOCAL_GUEST_OWNER) {
        void attemptSync(store);
      }
    };
    const onOffline = () => setOnline(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine && store && ownerId && ownerId !== LOCAL_GUEST_OWNER) {
        void attemptSync(store);
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

  // Periodic reconnect retry while pending work exists (covers WebViews where `online`
  // events don't fire cleanly across airplane-mode transitions).
  useEffect(() => {
    if (!store || !ownerId || ownerId === LOCAL_GUEST_OWNER) return;
    if (!syncSnap || syncSnap.pendingCount === 0 || syncSnap.status === "auth_required") return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void attemptSync(store);
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

  const timeZone = catalog?.profile.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const muscles = useMemo(() => catalog?.muscles ?? [], [catalog]);
  const equipment = useMemo(() => catalog?.equipment ?? [], [catalog]);
  const exercises = useMemo(() => catalog?.exercises ?? [], [catalog]);
  const muscleNames = useMemo(() => new Map(muscles.map((m) => [m.code, m.display_name])), [muscles]);

  const filteredExercises = useMemo(() => {
    const q = exQuery.trim().toLocaleLowerCase();
    return exercises.filter(
      (ex) =>
        (!q || `${ex.title} ${ex.slug}`.toLocaleLowerCase().includes(q)) &&
        (!exMuscle || ex.primary_muscle === exMuscle || ex.secondary_muscles.includes(exMuscle)) &&
        (!exEquipment || ex.equipment === exEquipment),
    );
  }, [exercises, exQuery, exMuscle, exEquipment]);

  async function enterLocalGuestMode() {
    const guestStore = await openOfflineStore(LOCAL_GUEST_OWNER);
    setOwnerId(LOCAL_GUEST_OWNER);
    setStore(guestStore);
    await reloadLocalState(guestStore);
    setScreen({ kind: "tab", tab: "workout" });
  }

  async function handleStartEmpty() {
    if (!store || !ownerId) return;
    if (activeWorkout) {
      setScreen({ kind: "logger", workout: activeWorkout });
      return;
    }
    const created = await startEmptyWorkoutOffline(store, ownerId);
    await reloadLocalState(store);
    setScreen({ kind: "logger", workout: created });
  }

  async function handleStartRoutine(routine: RoutineTree) {
    if (!store || !ownerId) return;
    const created = await startWorkoutFromRoutineOffline(store, ownerId, routine);
    await reloadLocalState(store);
    setScreen({ kind: "logger", workout: created });
  }

  if (loading) {
    return (
      <main className="training training-canvas flex min-h-dvh items-center justify-center p-6">
        <p className="training-muted text-sm">{t("common.loading")}</p>
      </main>
    );
  }

  // Fresh install or signed-out state: clear path to online setup OR local device use.
  if (!ownerId || !store) {
    return (
      <main className="training training-canvas mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-text)]">
            {t("common.appName")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("offline.fresh.title")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
            {t("offline.fresh.body")}
          </p>
        </header>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => window.location.assign(new URL("/sign-in", window.location.origin).href)}
            className="training-action min-h-12 w-full rounded-xl px-5 text-sm font-bold"
          >
            {t("offline.fresh.connect")}
          </button>
          <button
            type="button"
            onClick={() => void enterLocalGuestMode()}
            className="min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-5 text-sm font-semibold hover:bg-[var(--bg-surface-hover)]"
          >
            {t("offline.fresh.useLocal")}
          </button>
        </div>

        <DevicePreferences />
      </main>
    );
  }

  // Full-screen active logger inside the offline shell.
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
          previous={catalog?.previousPerformances ?? {}}
          offlineShellMode
          onMinimize={() => {
            void reloadLocalState(store);
            setScreen({ kind: "tab", tab: "workout" });
          }}
          onFinishedLocally={(finishedWorkout) => {
            void reloadLocalState(store).then(() => {
              setScreen({ kind: "recap", workout: finishedWorkout });
            });
          }}
          onDiscardedLocally={() => {
            void reloadLocalState(store).then(() => {
              setScreen({ kind: "tab", tab: "workout" });
            });
          }}
        />
      </div>
    );
  }

  const currentTab: OfflineTab = screen.kind === "tab" ? screen.tab : "workout";
  const pendingCount = syncSnap?.pendingCount ?? 0;
  const isGuest = ownerId === LOCAL_GUEST_OWNER;
  const isAuthRequired = syncSnap?.status === "auth_required";
  const isSyncing = syncSnap?.status === "syncing";

  return (
    <div className="training training-canvas min-h-dvh pb-[calc(5.5rem+var(--app-safe-bottom))]">
      {/* Top bar with clear offline / sync status */}
      <header className="sticky top-[var(--app-safe-top)] z-30 border-b border-[var(--border-subtle)] bg-[var(--nav-backdrop)] backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-semibold tracking-tight">{t("common.appName")}</span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                !online || pendingCount > 0 || isAuthRequired
                  ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]"
                  : "border-[var(--badge-border)] bg-[var(--badge-bg)] text-[var(--badge-text)]"
              }`}
            >
              {isAuthRequired
                ? t("offline.badge.authRequired")
                : isSyncing
                  ? t("offline.badge.syncing")
                  : pendingCount > 0 || !online
                    ? t("offline.badge.local")
                    : t("offline.badge.synced")}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {online && isAuthRequired ? (
              <a
                href="/sign-in"
                className="training-action rounded-lg px-3 py-1.5 text-xs font-bold"
              >
                {t("offline.status.signInToSync")}
              </a>
            ) : online && !isGuest && pendingCount > 0 ? (
              <button
                type="button"
                disabled={isSyncing}
                onClick={() => void attemptSync(store)}
                className="training-action rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50"
              >
                {t("offline.status.retrySync")}
              </button>
            ) : online && !isGuest ? (
              <button
                type="button"
                onClick={() => window.location.assign(new URL("/", window.location.origin).href)}
                className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--bg-surface-hover)]"
              >
                {t("offline.status.backOnline")}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {isGuest ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-sm text-[var(--warning-text)]">
            <p className="min-w-0 flex-1">{t("offline.fresh.localNotice")}</p>
            <button
              type="button"
              onClick={() => window.location.assign(new URL("/sign-in", window.location.origin).href)}
              className="rounded-lg border border-[var(--warning-border)] px-3 py-1.5 text-xs font-semibold"
            >
              {t("offline.fresh.connect")}
            </button>
          </div>
        ) : null}

        {screen.kind === "routineEditor" ? (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h1 className="text-2xl font-semibold">
                {screen.routine ? t("routines.edit") : t("routines.create")}
              </h1>
            </div>
            <RoutineEditor
              library={exercises}
              muscles={muscles}
              equipment={equipment}
              initial={screen.routine}
              onCancel={() => setScreen({ kind: "tab", tab: "workout" })}
              onSaveOverride={async (input) => {
                const saved = await saveRoutineOffline(store, ownerId, input, catalog);
                await reloadLocalState(store);
                if (navigator.onLine && !isGuest) {
                  void attemptSync(store);
                }
                setScreen({ kind: "tab", tab: "workout" });
                return { id: saved.id };
              }}
            />
          </section>
        ) : screen.kind === "recap" ? (
          <OfflineWorkoutRecap
            workout={screen.workout}
            pending={pendingWorkoutSet.has(screen.workout.id)}
            timeZone={timeZone}
            onBack={() => setScreen({ kind: "tab", tab: "home" })}
          />
        ) : currentTab === "home" ? (
          <section className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">{t("offline.shell.historyTitle")}</h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {pendingCount > 0
                    ? t("offline.status.pendingCount", { count: pendingCount })
                    : t("offline.status.allSynced")}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setScreen(
                    activeWorkout
                      ? { kind: "logger", workout: activeWorkout }
                      : { kind: "tab", tab: "workout" },
                  )
                }
                className="training-action min-h-11 rounded-xl px-4 text-sm font-bold"
              >
                {activeWorkout ? t("common.workoutHub.resume") : t("nav.workout")}
              </button>
            </header>

            {activeWorkout ? (
              <button
                type="button"
                onClick={() => setScreen({ kind: "logger", workout: activeWorkout })}
                className="training-elevated flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent-text)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-[var(--accent-text)]">
                    {t("common.workoutHub.resume")}
                  </span>
                  <span className="block truncate text-sm font-semibold">{activeWorkout.title}</span>
                </span>
                <span className="rounded-full border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warning-text)]">
                  {t("offline.badge.local")}
                </span>
              </button>
            ) : null}

            {completedWorkouts.length === 0 ? (
              <p className="training-panel rounded-2xl border-dashed p-6 text-sm text-[var(--text-muted)]">
                {t("offline.shell.historyEmpty")}
              </p>
            ) : (
              <ul className="space-y-3">
                {completedWorkouts.map((w) => {
                  const stats = summarizeWorkout(w);
                  const isLocalPending = pendingWorkoutSet.has(w.id);
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
                        onClick={() => setScreen({ kind: "recap", workout: w })}
                        className="training-panel block w-full rounded-2xl p-4 text-left hover:border-[var(--border-strong)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">{w.title}</span>
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
                })}
              </ul>
            )}
          </section>
        ) : currentTab === "workout" ? (
          <section className="space-y-6">
            <header>
              <h1 className="text-3xl font-semibold tracking-tight">{t("nav.workout")}</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{t("common.workoutHub.subtitle")}</p>
            </header>

            {activeWorkout ? (
              <button
                type="button"
                onClick={() => setScreen({ kind: "logger", workout: activeWorkout })}
                className="training-elevated flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent-text)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-[var(--accent-text)]">
                    {t("common.workoutHub.resume")}
                  </span>
                  <span className="block truncate text-sm font-semibold">{activeWorkout.title}</span>
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
                <span className="block text-base font-semibold">{t("common.workoutHub.startEmpty")}</span>
                <span className="mt-0.5 block text-sm opacity-85">{t("common.workoutHub.startHint")}</span>
              </span>
              <span aria-hidden="true" className="text-xl">+</span>
            </button>

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-semibold">{t("common.workoutHub.routines")}</h2>
                <button
                  type="button"
                  onClick={() => setScreen({ kind: "routineEditor" })}
                  className="min-h-11 rounded-xl border border-[var(--border-subtle)] px-3.5 text-sm font-semibold hover:bg-[var(--bg-surface)]"
                >
                  + {t("common.workoutHub.create")}
                </button>
              </div>

              {routines.length === 0 ? (
                <p className="training-panel rounded-2xl border-dashed p-5 text-sm text-[var(--text-muted)]">
                  {t("common.workoutHub.empty")}
                </p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {routines.map((routine) => {
                    const isLocalPending = pendingRoutineSet.has(routine.id);
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
                        <p className="mt-2 line-clamp-2 break-words text-sm text-[var(--text-muted)]">
                          {routine.exercises.length > 0
                            ? routine.exercises.map((e) => e.template.title).join(" · ")
                            : t("common.workoutHub.noExercises")}
                        </p>
                        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        ) : currentTab === "exercises" ? (
          <section className="space-y-4">
            <header>
              <h1 className="text-3xl font-semibold tracking-tight">{t("nav.exercises")}</h1>
            </header>

            {exercises.length === 0 ? (
              <p className="training-panel rounded-2xl border-dashed p-5 text-sm text-[var(--text-muted)]">
                {t("offline.shell.exercisesEmpty")}
              </p>
            ) : (
              <>
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

                <ul className="space-y-2">
                  {filteredExercises.slice(0, 120).map((ex) => {
                    const expanded = expandedExId === ex.id;
                    return (
                      <li key={ex.id} className="training-panel rounded-2xl p-3">
                        <button
                          type="button"
                          onClick={() => setExpandedExId(expanded ? null : ex.id)}
                          className="flex w-full items-center gap-3 text-left"
                        >
                          <ExerciseThumbnail slug={ex.slug} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-sm font-semibold">{ex.title}</span>
                            <span className="block text-xs text-[var(--text-muted)]">
                              {muscleNames.get(ex.primary_muscle) ?? ex.primary_muscle}
                            </span>
                          </span>
                        </button>
                        {expanded && ex.how_to ? (
                          <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-muted)]">
                            {ex.how_to}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        ) : (
          <section className="space-y-6">
            <header>
              <h1 className="text-3xl font-semibold tracking-tight">{t("nav.settings")}</h1>
            </header>

            <DevicePreferences userId={ownerId} />

            <div className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-sm text-[var(--warning-text)]">
              <p className="font-semibold">{t("account.offline.banner")}</p>
              <p className="mt-1 text-xs opacity-90">{t("account.offline.requiresConnection")}</p>
            </div>
          </section>
        )}
      </main>

      {/* Persistent offline bottom navigation */}
      <nav
        aria-label={t("nav.primary")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--nav-backdrop)] pb-[var(--app-safe-bottom)] backdrop-blur"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {(
            [
              { tab: "home", label: "nav.home", icon: "home" },
              { tab: "workout", label: "nav.workout", icon: "workout" },
              { tab: "exercises", label: "nav.exercises", icon: "exercises" },
              { tab: "settings", label: "nav.profile", icon: "profile" },
            ] as const
          ).map(({ tab, label, icon }) => {
            const active = screen.kind === "tab" && screen.tab === tab;
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

function OfflineWorkoutRecap({
  workout,
  pending,
  timeZone,
  onBack,
}: {
  workout: LoggedWorkout;
  pending: boolean;
  timeZone: string;
  onBack: () => void;
}) {
  const { locale, t } = useI18n();
  const stats = summarizeWorkout(workout);
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
        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
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
          {t(pending ? "offline.badge.local" : "offline.badge.synced")}
        </span>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t("workouts.recap.title")}</h1>
        <h2 className="mt-2 text-xl font-medium">{workout.title}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {formatDateTime(locale, new Date(workout.started_at), timeZone)}
        </p>
        {pending ? (
          <p className="mt-2 text-xs text-[var(--warning-text)]">{t("offline.shell.savedLocalFinish")}</p>
        ) : null}
      </header>

      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="training-panel rounded-2xl p-3 sm:p-4">
          <dt className="text-xs text-[var(--text-muted)]">{t("workouts.metric.duration")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{formatDuration(locale, stats.durationSeconds)}</dd>
        </div>
        <div className="training-panel rounded-2xl p-3 sm:p-4">
          <dt className="text-xs text-[var(--text-muted)]">{t("workouts.recap.completedSets")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(locale, stats.completedSets)}</dd>
        </div>
        <div className="training-panel rounded-2xl p-3 sm:p-4">
          <dt className="text-xs text-[var(--text-muted)]">{t("workouts.metric.volume")}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{formatVolumeKg(stats.volumeKg, locale)}</dd>
        </div>
      </dl>

      <ol className="space-y-3">
        {performed.map(({ exercise, sets }) => (
          <li key={exercise.id} className="training-panel rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <ExerciseThumbnail slug={exercise.template.slug} />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{exercise.template.title}</h3>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {t("workouts.recap.setsCompleted", { count: sets.length })}
                </p>
              </div>
            </div>
            {exercise.notes ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-muted)]">{exercise.notes}</p>
            ) : null}
            <ol className="mt-3 divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
              {sets.map((set, index) => (
                <li key={set.id} className="flex items-baseline gap-3 py-2.5 text-sm">
                  <span className="w-5 text-right tabular-nums text-[var(--text-muted)]">{index + 1}.</span>
                  <span className="font-medium tabular-nums">
                    {formatSetValues(set, exercise.template.exercise_type, locale)}
                  </span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  );
}
