export interface RestCountdown {
  key: string;
  anchorId: string | null;
  deadline: number;
  phase: "running" | "finished" | "dismissed";
}

export interface RestCountdownState {
  version: 1;
  /** A high-water mark prevents undo from reviving an older completed set. */
  latestAnchorTime: number | null;
  seenKeys: string[];
  /** Keys for which completion alerts have already fired; guarantees fire-once. */
  alertedKeys?: string[];
  current: RestCountdown | null;
}

export interface RestCountdownInput {
  anchor: string | null;
  anchorId?: string | null;
  validAnchorIds?: readonly string[];
  restSeconds: number | null;
  workoutActive: boolean;
}

export function emptyRestCountdown(): RestCountdownState {
  return { version: 1, latestAnchorTime: null, seenKeys: [], alertedKeys: [], current: null };
}

export function restCountdownStorageKey(workoutId: string, userId?: string): string {
  return `forte:rest:v1:${encodeURIComponent(userId ?? "anonymous")}:${encodeURIComponent(workoutId)}`;
}

/** Invalid or obsolete session data must not restart a rest. */
export function parseRestCountdown(raw: string | null): RestCountdownState {
  if (!raw) return emptyRestCountdown();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return emptyRestCountdown();
    const state = value as Record<string, unknown>;
    if (
      state.version !== 1 ||
      (state.latestAnchorTime !== null &&
        (typeof state.latestAnchorTime !== "number" || !Number.isFinite(state.latestAnchorTime))) ||
      !Array.isArray(state.seenKeys) ||
      !state.seenKeys.every((key: unknown) => typeof key === "string")
    ) return emptyRestCountdown();
    const alertedKeys =
      Array.isArray(state.alertedKeys) && state.alertedKeys.every((k: unknown) => typeof k === "string")
        ? (state.alertedKeys as string[])
        : [];
    let current: RestCountdown | null = null;
    if (state.current !== null) {
      if (!state.current || typeof state.current !== "object") return emptyRestCountdown();
      const timer = state.current as Record<string, unknown>;
      if (
        typeof timer.key !== "string" ||
        (timer.anchorId !== null && typeof timer.anchorId !== "string") ||
        typeof timer.deadline !== "number" || !Number.isFinite(timer.deadline) ||
        (timer.phase !== "running" && timer.phase !== "finished" && timer.phase !== "dismissed")
      ) return emptyRestCountdown();
      current = {
        key: timer.key,
        anchorId: timer.anchorId,
        deadline: timer.deadline,
        phase: timer.phase,
      };
    }
    return {
      version: 1,
      latestAnchorTime: state.latestAnchorTime,
      seenKeys: state.seenKeys,
      alertedKeys,
      current,
    };
  } catch {
    return emptyRestCountdown();
  }
}

export function dismissRestCountdown(state: RestCountdownState): RestCountdownState {
  if (!state.current || state.current.phase === "dismissed") return state;
  return { ...state, current: { ...state.current, phase: "dismissed" } };
}

/** Whether a completion alert should fire for the active finished timer (once per timer key). */
export function shouldTriggerRestAlert(state: RestCountdownState): boolean {
  if (state.current?.phase !== "finished") return false;
  const alerted = state.alertedKeys ?? [];
  return !alerted.includes(state.current.key);
}

/** Records that the completion alert for the current timer has fired so it never replays. */
export function markRestCountdownAlerted(state: RestCountdownState): RestCountdownState {
  if (!state.current) return state;
  const alerted = state.alertedKeys ?? [];
  if (alerted.includes(state.current.key)) return state;
  return {
    ...state,
    alertedKeys: [...alerted, state.current.key],
  };
}

/** Reconcile set identity, never render time or a fresh duration, with the dock. */
export function reconcileRestCountdown(
  state: RestCountdownState,
  input: RestCountdownInput,
  now: number,
  initialEntry = false,
): RestCountdownState {
  if (!input.workoutActive) return emptyRestCountdown();
  const anchorTime = input.anchor ? Date.parse(input.anchor) : Number.NaN;
  const anchorId = input.anchorId ?? null;
  const valid = !input.validAnchorIds || anchorId === null || input.validAnchorIds.includes(anchorId);
  if (!Number.isFinite(anchorTime) || !valid) return dismissRestCountdown(state);

  const key = JSON.stringify([anchorId, anchorTime]);
  if (state.current?.key === key) {
    if (!input.restSeconds || input.restSeconds <= 0) return dismissRestCountdown(state);
    // An elapsed rest discovered on entry is history, not a new completion cue.
    if (initialEntry && (state.current.phase === "finished" || state.current.deadline <= now)) {
      return dismissRestCountdown(state);
    }
    return state;
  }
  if (state.seenKeys.includes(key) || (state.latestAnchorTime !== null && anchorTime < state.latestAnchorTime)) {
    return dismissRestCountdown(state);
  }

  const duration = typeof input.restSeconds === "number" && Number.isFinite(input.restSeconds)
    ? Math.max(0, input.restSeconds) * 1000
    : 0;
  const deadline = anchorTime + duration;
  return {
    version: 1,
    latestAnchorTime: Math.max(state.latestAnchorTime ?? anchorTime, anchorTime),
    seenKeys: [...state.seenKeys, key],
    alertedKeys: state.alertedKeys ?? [],
    current: { key, anchorId, deadline, phase: duration > 0 && deadline > now ? "running" : "dismissed" },
  };
}

export function advanceRestCountdown(state: RestCountdownState, now: number): RestCountdownState {
  if (state.current?.phase !== "running" || state.current.deadline > now) return state;
  return { ...state, current: { ...state.current, phase: "finished" } };
}

export function adjustRestCountdown(state: RestCountdownState, seconds: number, now: number): RestCountdownState {
  if (state.current?.phase !== "running" || !Number.isFinite(seconds)) return state;
  const deadline = state.current.deadline + seconds * 1000;
  return { ...state, current: { ...state.current, deadline, phase: deadline > now ? "running" : "finished" } };
}
