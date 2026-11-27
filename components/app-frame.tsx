"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BottomNav, NavigationIcon } from "@/components/bottom-nav";
import { Sidebar } from "@/components/sidebar";
import { OfflineSyncBridge } from "@/components/offline-sync-bridge";
import { useI18n } from "@/lib/i18n/context";

export type NavigationWorkout = { id: string; title: string; startedAt: string };

export function WorkoutResumeLink({ workout }: { workout: NavigationWorkout }) {
  const { t } = useI18n();
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    const startedAt = new Date(workout.startedAt).getTime();
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [workout.startedAt]);

  const elapsed =
    seconds === null
      ? "—"
      : [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
          .map((part) => String(part).padStart(2, "0"))
          .join(":");

  return (
    <Link
      href={`/workouts/${workout.id}`}
      className="training-elevated flex min-h-16 min-w-0 items-center gap-3 rounded-2xl px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent-text)]" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-[var(--accent-text)]">
          {t("common.workoutHub.resume")}
        </span>
        <span className="block truncate text-sm font-medium">{workout.title}</span>
      </span>
      <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
        {t("common.workoutHub.elapsed", { time: elapsed })}
      </span>
      <span aria-hidden="true" className="hidden shrink-0 sm:inline">
        →
      </span>
    </Link>
  );
}

/** Server-owned activity determines whether a workout detail is the full-screen logger. */
export function AppFrame({
  children,
  userId,
  displayName,
  activeWorkout,
}: {
  children: ReactNode;
  userId: string;
  displayName: string;
  activeWorkout: NavigationWorkout | null;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const ownsScreen = activeWorkout !== null && pathname === `/workouts/${activeWorkout.id}`;

  if (ownsScreen) {
    return (
      <div className="training training-canvas min-h-dvh min-w-0">
        {children}
      </div>
    );
  }

  return (
    <div className="training training-canvas app-frame min-h-dvh min-w-0">
      <Sidebar displayName={displayName} />
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] sm:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-1">
          <Link
            href="/"
            className="inline-flex min-h-11 min-w-11 items-center text-lg font-semibold tracking-tight"
          >
            {t("common.appName")}
          </Link>
          <Link
            href="/profile"
            aria-label={t("nav.profile")}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
          >
            <NavigationIcon name="profile" className="h-5 w-5" />
          </Link>
        </div>
      </header>
      <div className="app-content min-w-0 pb-[calc(5rem+var(--app-safe-bottom))] sm:pb-[var(--app-safe-bottom)] sm:pl-52 lg:pl-64">
        <OfflineSyncBridge userId={userId} />
        {activeWorkout && pathname !== "/workout" ? (
          <div className="resume-outside-logger mx-auto max-w-6xl px-4 pt-4 sm:px-6">
            <WorkoutResumeLink workout={activeWorkout} />
          </div>
        ) : null}
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
