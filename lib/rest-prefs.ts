/**
 * Offline-persisted rest timer preferences (account-scoped on this device)
 * plus completion alerts (Web Audio chime, Vibration API, and native shell
 * bridges for background / locked-screen alerts on Android and iOS).
 */

export interface RestPreferences {
  defaultRestSeconds: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export const DEFAULT_REST_PREFS: RestPreferences = {
  defaultRestSeconds: 90,
  soundEnabled: true,
  vibrationEnabled: true,
};

export const REST_PREFS_EVENT = "forte:rest-prefs-change";

interface NativeAndroidAlerts {
  scheduleRestTimer?: (
    timerKey: string,
    triggerAtMs: number,
    sound: boolean,
    vibrate: boolean,
    title: string,
    body: string,
  ) => void;
  cancelRestTimer?: () => void;
  previewRestAlert?: (sound: boolean, vibrate: boolean) => void;
}

interface NativeIOSHandler {
  postMessage?: (payload: Record<string, unknown>) => void;
}

function getAndroidAlerts(): NativeAndroidAlerts | null {
  if (typeof window === "undefined") return null;
  const bridge = Reflect.get(window, "ForteNativeAlerts") as NativeAndroidAlerts | undefined;
  return bridge && typeof bridge === "object" ? bridge : null;
}

function getIOSAlerts(): NativeIOSHandler | null {
  if (typeof window === "undefined") return null;
  const webkit = Reflect.get(window, "webkit") as
    | { messageHandlers?: { forteRestTimer?: NativeIOSHandler } }
    | undefined;
  return webkit?.messageHandlers?.forteRestTimer ?? null;
}

export function restPrefsKey(userId?: string): string {
  return `forte:rest-prefs:v1:${encodeURIComponent(userId ?? "device")}`;
}

export function legacyDefaultRestKey(userId?: string): string {
  return `forte:default-rest:${userId ?? "device"}`;
}

function clampRest(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isInteger(n) && n >= 0 && n <= 86_400) return n;
  return fallback;
}

export function readRestPreferences(userId?: string): RestPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_REST_PREFS };
  let legacyDefault = DEFAULT_REST_PREFS.defaultRestSeconds;
  try {
    const rawLegacy = window.localStorage.getItem(legacyDefaultRestKey(userId));
    if (rawLegacy !== null) legacyDefault = clampRest(rawLegacy, legacyDefault);
  } catch {
    // Ignore storage read errors.
  }

  try {
    const raw = window.localStorage.getItem(restPrefsKey(userId));
    if (!raw) {
      return {
        defaultRestSeconds: legacyDefault,
        soundEnabled: DEFAULT_REST_PREFS.soundEnabled,
        vibrationEnabled: DEFAULT_REST_PREFS.vibrationEnabled,
      };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_REST_PREFS, defaultRestSeconds: legacyDefault };
    }
    const record = parsed as Record<string, unknown>;
    return {
      defaultRestSeconds: clampRest(record.defaultRestSeconds, legacyDefault),
      soundEnabled: typeof record.soundEnabled === "boolean" ? record.soundEnabled : true,
      vibrationEnabled: typeof record.vibrationEnabled === "boolean" ? record.vibrationEnabled : true,
    };
  } catch {
    return { ...DEFAULT_REST_PREFS, defaultRestSeconds: legacyDefault };
  }
}

export function writeRestPreferences(userId: string | undefined, patch: Partial<RestPreferences>): RestPreferences {
  const current = readRestPreferences(userId);
  const next: RestPreferences = {
    defaultRestSeconds: clampRest(patch.defaultRestSeconds, current.defaultRestSeconds),
    soundEnabled: typeof patch.soundEnabled === "boolean" ? patch.soundEnabled : current.soundEnabled,
    vibrationEnabled: typeof patch.vibrationEnabled === "boolean" ? patch.vibrationEnabled : current.vibrationEnabled,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(restPrefsKey(userId), JSON.stringify(next));
      // Keep the legacy key in step for any reader that checks it directly.
      window.localStorage.setItem(legacyDefaultRestKey(userId), String(next.defaultRestSeconds));
    } catch {
      // Storage may be disabled; caller still holds in-memory state.
    }
    window.dispatchEvent(new CustomEvent(REST_PREFS_EVENT, { detail: { userId, prefs: next } }));
  }
  return next;
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (Reflect.get(window, "webkitAudioContext") as typeof AudioContext | undefined);
  if (!Ctor) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new Ctor();
  }
  return sharedAudioCtx;
}

/** Plays a short, pleasant two-note chime offline using Web Audio API. */
export function playRestChime(): boolean {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const notes = [
      { freq: 659.25, start: 0, dur: 0.16 }, // E5
      { freq: 880.0, start: 0.16, dur: 0.28 }, // A5
    ];
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, now + note.start);
      gain.gain.setValueAtTime(0.001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.24, now + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.02);
    }
    return true;
  } catch {
    return false;
  }
}

/** Triggers a subtle double vibration pattern where supported. */
export function triggerRestVibration(): boolean {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      return navigator.vibrate([180, 90, 220]);
    }
  } catch {
    // Vibration not permitted or unavailable.
  }
  return false;
}

/**
 * Fires the foreground/preview rest alert according to the user's toggles.
 * Prefers native alert helper when running inside the Android or iOS shell
 * so vibration and notification audio work even when WebView AudioContext is muted.
 */
export function triggerRestCompletionAlert(options: {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}): { soundPlayed: boolean; vibrated: boolean } {
  const { soundEnabled, vibrationEnabled } = options;
  if (!soundEnabled && !vibrationEnabled) {
    return { soundPlayed: false, vibrated: false };
  }

  const android = getAndroidAlerts();
  if (android?.previewRestAlert) {
    try {
      android.previewRestAlert(soundEnabled, vibrationEnabled);
      return { soundPlayed: soundEnabled, vibrated: vibrationEnabled };
    } catch {
      // Fall through to web APIs.
    }
  }

  const ios = getIOSAlerts();
  if (ios?.postMessage) {
    try {
      ios.postMessage({
        action: "preview",
        sound: soundEnabled,
        vibrate: vibrationEnabled,
      });
    } catch {
      // Fall through to web APIs.
    }
  }

  const soundPlayed = soundEnabled ? playRestChime() : false;
  const vibrated = vibrationEnabled ? triggerRestVibration() : false;
  return { soundPlayed, vibrated };
}

/** Schedules a native background/locked-screen alert when supported. */
export function scheduleNativeRestAlert(params: {
  timerKey: string;
  deadlineMs: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  title: string;
  body: string;
}): void {
  const { timerKey, deadlineMs, soundEnabled, vibrationEnabled, title, body } = params;
  if (!soundEnabled && !vibrationEnabled) {
    cancelNativeRestAlert();
    return;
  }
  const android = getAndroidAlerts();
  if (android?.scheduleRestTimer) {
    try {
      android.scheduleRestTimer(timerKey, deadlineMs, soundEnabled, vibrationEnabled, title, body);
      return;
    } catch {
      // Ignore bridge error.
    }
  }
  const ios = getIOSAlerts();
  if (ios?.postMessage) {
    try {
      ios.postMessage({
        action: "schedule",
        key: timerKey,
        triggerAtMs: deadlineMs,
        sound: soundEnabled,
        vibrate: vibrationEnabled,
        title,
        body,
      });
    } catch {
      // Ignore bridge error.
    }
  }
}

/** Cancels any pending native background/locked-screen rest alert. */
export function cancelNativeRestAlert(): void {
  const android = getAndroidAlerts();
  if (android?.cancelRestTimer) {
    try {
      android.cancelRestTimer();
    } catch {
      // Ignore bridge error.
    }
  }
  const ios = getIOSAlerts();
  if (ios?.postMessage) {
    try {
      ios.postMessage({ action: "cancel" });
    } catch {
      // Ignore bridge error.
    }
  }
}
