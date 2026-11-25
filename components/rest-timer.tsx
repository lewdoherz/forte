"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { formatStopwatch } from "@/lib/i18n/format";
import {
  adjustRestCountdown,
  advanceRestCountdown,
  dismissRestCountdown,
  markRestCountdownAlerted,
  parseRestCountdown,
  reconcileRestCountdown,
  restCountdownStorageKey,
  shouldTriggerRestAlert,
  type RestCountdownState,
} from "@/lib/rest-countdown";
import {
  cancelNativeRestAlert,
  DEFAULT_REST_PREFS,
  readRestPreferences,
  REST_PREFS_EVENT,
  scheduleNativeRestAlert,
  triggerRestCompletionAlert,
  type RestPreferences,
} from "@/lib/rest-prefs";

interface RestTimerProps {
  workoutId: string;
  anchor: string | null;
  restSeconds: number | null;
  workoutActive: boolean;
  anchorId?: string | null;
  validAnchorIds?: string[];
  userId?: string;
}

interface TimerSnapshot {
  storageKey: string;
  state: RestCountdownState;
  now: number;
}

function readSession(key: string): RestCountdownState {
  try {
    return parseRestCountdown(window.sessionStorage.getItem(key));
  } catch {
    return parseRestCountdown(null);
  }
}

function writeSession(key: string, state: RestCountdownState, active: boolean): void {
  try {
    if (active) window.sessionStorage.setItem(key, JSON.stringify(state));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage may be disabled in a WebView; the in-memory countdown still works.
  }
}

/** A wall-clock countdown whose persisted identity is the completed set. */
export function RestTimer({
  workoutId,
  anchor,
  restSeconds,
  workoutActive,
  anchorId,
  validAnchorIds,
  userId,
}: RestTimerProps) {
  const { t } = useI18n();
  const storageKey = restCountdownStorageKey(workoutId, userId);
  const snapshotRef = useRef<TimerSnapshot | null>(null);
  const [snapshot, setSnapshot] = useState<TimerSnapshot | null>(null);
  const prefsRef = useRef<RestPreferences>(DEFAULT_REST_PREFS);
  const validIdsKey = JSON.stringify(validAnchorIds ?? null);

  useEffect(() => {
    const syncPrefs = () => {
      prefsRef.current = readRestPreferences(userId);
      const current = snapshotRef.current?.state.current;
      if (workoutActive && current?.phase === "running") {
        scheduleNativeRestAlert({
          timerKey: current.key,
          deadlineMs: current.deadline,
          soundEnabled: prefsRef.current.soundEnabled,
          vibrationEnabled: prefsRef.current.vibrationEnabled,
          title: t("training.rest.finished"),
          body: t("training.rest.ready"),
        });
      }
    };
    syncPrefs();
    window.addEventListener(REST_PREFS_EVENT, syncPrefs);
    return () => window.removeEventListener(REST_PREFS_EVENT, syncPrefs);
  }, [userId, workoutActive, t]);

  useEffect(() => {
    const validIds = JSON.parse(validIdsKey) as string[] | null;

    const commitState = (state: RestCountdownState, now: number, active: boolean) => {
      let nextState = state;
      if (active && shouldTriggerRestAlert(nextState)) {
        const key = nextState.current
          ? `${nextState.current.key}@${nextState.current.deadline}`
          : undefined;
        nextState = markRestCountdownAlerted(nextState);
        cancelNativeRestAlert();
        triggerRestCompletionAlert({
          soundEnabled: prefsRef.current.soundEnabled,
          vibrationEnabled: prefsRef.current.vibrationEnabled,
          timerKey: key,
        });
      } else if (active && nextState.current?.phase === "running") {
        scheduleNativeRestAlert({
          timerKey: nextState.current.key,
          deadlineMs: nextState.current.deadline,
          soundEnabled: prefsRef.current.soundEnabled,
          vibrationEnabled: prefsRef.current.vibrationEnabled,
          title: t("training.rest.finished"),
          body: t("training.rest.ready"),
        });
      } else {
        cancelNativeRestAlert();
      }
      const value = { storageKey, state: nextState, now };
      snapshotRef.current = value;
      writeSession(storageKey, nextState, active);
      setSnapshot(value);
    };

    const initialize = setTimeout(() => {
      const previous = snapshotRef.current;
      const initialEntry = previous?.storageKey !== storageKey;
      const state = previous?.storageKey === storageKey ? previous.state : readSession(storageKey);
      const now = Date.now();
      const next = reconcileRestCountdown(
        state,
        {
          anchor,
          anchorId,
          restSeconds,
          workoutActive,
          validAnchorIds: validIds ?? undefined,
        },
        now,
        initialEntry,
      );
      commitState(next, now, workoutActive);
    }, 0);

    const tick = () => {
      const previous = snapshotRef.current;
      if (
        previous?.storageKey !== storageKey ||
        !workoutActive ||
        previous.state.current?.phase !== "running"
      ) {
        return;
      }
      const now = Date.now();
      const state = advanceRestCountdown(previous.state, now);
      if (state !== previous.state) {
        commitState(state, now, true);
      } else {
        const value = { storageKey, state, now };
        snapshotRef.current = value;
        setSnapshot(value);
      }
    };
    const interval = setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(initialize);
      clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [storageKey, anchor, anchorId, restSeconds, workoutActive, validIdsKey, t]);

  useEffect(() => {
    return () => {
      cancelNativeRestAlert();
    };
  }, []);

  const apply = (change: (state: RestCountdownState, now: number) => RestCountdownState) => {
    const previous = snapshotRef.current;
    if (previous?.storageKey !== storageKey) return;
    const now = Date.now();
    let state = change(previous.state, now);
    if (workoutActive && shouldTriggerRestAlert(state)) {
      const key = state.current ? `${state.current.key}@${state.current.deadline}` : undefined;
      state = markRestCountdownAlerted(state);
      cancelNativeRestAlert();
      triggerRestCompletionAlert({
        soundEnabled: prefsRef.current.soundEnabled,
        vibrationEnabled: prefsRef.current.vibrationEnabled,
        timerKey: key,
      });
    } else if (workoutActive && state.current?.phase === "running") {
      scheduleNativeRestAlert({
        timerKey: state.current.key,
        deadlineMs: state.current.deadline,
        soundEnabled: prefsRef.current.soundEnabled,
        vibrationEnabled: prefsRef.current.vibrationEnabled,
        title: t("training.rest.finished"),
        body: t("training.rest.ready"),
      });
    } else {
      cancelNativeRestAlert();
    }
    const value = { storageKey, state, now };
    snapshotRef.current = value;
    writeSession(storageKey, state, workoutActive);
    setSnapshot(value);
  };

  const timer = snapshot?.storageKey === storageKey ? snapshot.state.current : null;
  const anchorTime = anchor ? Date.parse(anchor) : Number.NaN;
  const expectedKey = JSON.stringify([anchorId ?? null, anchorTime]);
  if (
    !workoutActive ||
    !snapshot ||
    !timer ||
    timer.phase === "dismissed" ||
    timer.key !== expectedKey ||
    (anchorId && validAnchorIds && !validAnchorIds.includes(anchorId))
  ) {
    return null;
  }

  const finished = timer.phase === "finished";
  const remaining = Math.max(0, Math.ceil((timer.deadline - snapshot.now) / 1000));

  return (
    <section
      aria-label={t("training.rest.label")}
      className={`training fixed left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 mx-auto max-w-xl rounded-2xl border px-3 py-2 shadow-2xl ${
        finished
          ? "border-[var(--rest-finished-border)] bg-[var(--rest-finished-bg)]"
          : "border-[var(--border-strong)] bg-[var(--bg-surface)]"
      }`}
    >
      {finished ? (
        <div className="flex min-h-14 items-center gap-3">
          <span aria-hidden="true" className="text-2xl text-[var(--accent-text)]">
            ✓
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold" role="status">
              {t("training.rest.finished")}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{t("training.rest.ready")}</p>
          </div>
          <button
            type="button"
            onClick={() => apply(dismissRestCountdown)}
            aria-label={t("training.rest.dismiss")}
            className="h-11 w-11 rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)]"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px_auto] items-center gap-2">
          <button
            type="button"
            onClick={() => apply((state, now) => adjustRestCountdown(state, -15, now))}
            aria-label={t("training.rest.subtract")}
            className="h-11 rounded-xl border border-[var(--border-subtle)] text-sm font-semibold hover:bg-[var(--bg-surface-hover)]"
          >
            −{t("common.quantityTight", { value: 15, unit: t("common.unit.seconds") })}
          </button>
          <div className="text-center">
            <p className="text-[11px] text-[var(--text-muted)]">{t("training.rest.label")}</p>
            <p className="text-2xl font-semibold tabular-nums" role="timer" aria-live="off">
              {formatStopwatch(remaining)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => apply((state, now) => adjustRestCountdown(state, 15, now))}
            aria-label={t("training.rest.add")}
            className="h-11 rounded-xl border border-[var(--border-subtle)] text-sm font-semibold hover:bg-[var(--bg-surface-hover)]"
          >
            +{t("common.quantityTight", { value: 15, unit: t("common.unit.seconds") })}
          </button>
          <button
            type="button"
            onClick={() => apply(dismissRestCountdown)}
            className="training-action h-11 rounded-xl px-3 text-sm font-semibold"
          >
            {t("training.rest.skip")}
          </button>
        </div>
      )}
    </section>
  );
}
