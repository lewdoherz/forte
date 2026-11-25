/**
 * Offline-persisted rest timer preferences (account-scoped on this device)
 * plus completion alerts (local WAV audio, Web Audio fallback, Vibration API,
 * and native shell bridges with real system/permission diagnostics on Android and iOS).
 */

import { resolveAssetUrl } from "@/lib/builtin-catalog";

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
export const NATIVE_ALERT_STATUS_EVENT = "forte:native-alert-status";

export type AlertBlockReason =
  | "dnd"
  | "silent"
  | "vibrate_mode"
  | "volume_zero"
  | "notifications_off"
  | "channel_blocked"
  | "no_vibrator"
  | "exact_alarm_off";

export interface NativeRestAlertStatus {
  platform: "android" | "ios" | "web";
  notificationsEnabled: boolean;
  postNotificationsGranted: boolean;
  channelBlocked: boolean;
  dndBlocking: boolean;
  ringerMode: "normal" | "vibrate" | "silent" | "unknown";
  notificationVolumeZero: boolean;
  hasVibrator: boolean;
  exactAlarmsAllowed: boolean;
}

export interface AlertDeliveryResult {
  soundPlayed: boolean;
  vibrated: boolean;
  blockedReasons: AlertBlockReason[];
}

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
  previewRestAlert?: (sound: boolean, vibrate: boolean) => string | void;
  triggerForegroundRestAlert?: (timerKey: string, sound: boolean, vibrate: boolean) => string | void;
  getRestAlertStatus?: (sound: boolean, vibrate: boolean) => string;
  requestNotificationPermission?: () => void;
  openNotificationSettings?: () => void;
  openExactAlarmSettings?: () => void;
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

export function writeRestPreferences(
  userId: string | undefined,
  patch: Partial<RestPreferences>,
): RestPreferences {
  const current = readRestPreferences(userId);
  const next: RestPreferences = {
    defaultRestSeconds: clampRest(patch.defaultRestSeconds, current.defaultRestSeconds),
    soundEnabled:
      typeof patch.soundEnabled === "boolean" ? patch.soundEnabled : current.soundEnabled,
    vibrationEnabled:
      typeof patch.vibrationEnabled === "boolean"
        ? patch.vibrationEnabled
        : current.vibrationEnabled,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(restPrefsKey(userId), JSON.stringify(next));
      window.localStorage.setItem(legacyDefaultRestKey(userId), String(next.defaultRestSeconds));
    } catch {
      // Storage may be disabled; caller still holds in-memory state.
    }
    window.dispatchEvent(new CustomEvent(REST_PREFS_EVENT, { detail: { userId, prefs: next } }));
  }
  return next;
}

/** Reads live native permission and system alert diagnostics (Android / iOS). */
export function readNativeRestAlertStatus(
  soundEnabled: boolean,
  vibrationEnabled: boolean,
): NativeRestAlertStatus | null {
  const android = getAndroidAlerts();
  if (android?.getRestAlertStatus) {
    try {
      const raw = android.getRestAlertStatus(soundEnabled, vibrationEnabled);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<NativeRestAlertStatus>;
        return {
          platform: "android",
          notificationsEnabled: parsed.notificationsEnabled ?? true,
          postNotificationsGranted: parsed.postNotificationsGranted ?? true,
          channelBlocked: parsed.channelBlocked ?? false,
          dndBlocking: parsed.dndBlocking ?? false,
          ringerMode: parsed.ringerMode ?? "normal",
          notificationVolumeZero: parsed.notificationVolumeZero ?? false,
          hasVibrator: parsed.hasVibrator ?? true,
          exactAlarmsAllowed: parsed.exactAlarmsAllowed ?? true,
        };
      }
    } catch {
      // Ignore malformed JSON.
    }
  }
  const ios = getIOSAlerts();
  if (ios?.postMessage) {
    try {
      ios.postMessage({ action: "status" });
    } catch {
      // Ignore bridge error.
    }
  }
  return null;
}

export function requestNativeNotificationPermission(): void {
  const android = getAndroidAlerts();
  if (android?.requestNotificationPermission) {
    try {
      android.requestNotificationPermission();
      return;
    } catch {
      // Ignore.
    }
  }
  const ios = getIOSAlerts();
  if (ios?.postMessage) {
    try {
      ios.postMessage({ action: "requestPermission" });
    } catch {
      // Ignore.
    }
  }
}

export function openNativeNotificationSettings(): void {
  try {
    getAndroidAlerts()?.openNotificationSettings?.();
  } catch {
    // Ignore.
  }
}

export function openNativeExactAlarmSettings(): void {
  try {
    getAndroidAlerts()?.openExactAlarmSettings?.();
  } catch {
    // Ignore.
  }
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

function playWebAudioNotes(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const notes = [
    { freq: 659.25, start: 0, dur: 0.17 }, // E5
    { freq: 880.0, start: 0.16, dur: 0.3 }, // A5
  ];
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(note.freq, now + note.start);
    gain.gain.setValueAtTime(0.001, now + note.start);
    gain.gain.exponentialRampToValueAtTime(0.28, now + note.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + note.start);
    osc.stop(now + note.start + note.dur + 0.02);
  }
}

/** Plays the local chime offline via Web Audio API with bundled WAV fallback. */
export function playRestChime(): boolean {
  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === "suspended") {
        void ctx
          .resume()
          .then(() => playWebAudioNotes(ctx))
          .catch(() => {});
      } else {
        playWebAudioNotes(ctx);
      }
      return true;
    }
  } catch {
    // Fall through to HTMLAudioElement.
  }
  try {
    if (typeof Audio !== "undefined") {
      const audio = new Audio(resolveAssetUrl("/audio/rest_chime.wav"));
      void audio.play().catch(() => {});
      return true;
    }
  } catch {
    // Non-fatal.
  }
  return false;
}

/** Triggers a subtle double vibration pattern where supported. */
export function triggerRestVibration(): boolean {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      return navigator.vibrate([220, 100, 260]);
    }
  } catch {
    // Vibration not permitted or unavailable.
  }
  return false;
}

function parseAndroidAlertResult(
  raw: string | void,
  soundEnabled: boolean,
  vibrationEnabled: boolean,
): AlertDeliveryResult {
  if (typeof raw === "string" && raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as {
        soundDelivered?: boolean;
        vibrateDelivered?: boolean;
        blockedReasons?: AlertBlockReason[];
      };
      return {
        soundPlayed: Boolean(parsed.soundDelivered),
        vibrated: Boolean(parsed.vibrateDelivered),
        blockedReasons: Array.isArray(parsed.blockedReasons) ? parsed.blockedReasons : [],
      };
    } catch {
      // Fall through.
    }
  }
  return {
    soundPlayed: soundEnabled,
    vibrated: vibrationEnabled,
    blockedReasons: [],
  };
}

/**
 * Fires the foreground/preview rest alert according to the user's toggles.
 * Uses local native WAV + VibrationAttributes on Android and AVAudioPlayer/Haptics
 * on iOS, reporting exact blocked reasons when DND/Silent/Volume prevents delivery.
 */
export function triggerRestCompletionAlert(options: {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  timerKey?: string;
}): AlertDeliveryResult {
  const { soundEnabled, vibrationEnabled, timerKey } = options;
  if (!soundEnabled && !vibrationEnabled) {
    return { soundPlayed: false, vibrated: false, blockedReasons: [] };
  }

  const android = getAndroidAlerts();
  if (android) {
    try {
      if (timerKey && android.triggerForegroundRestAlert) {
        const raw = android.triggerForegroundRestAlert(timerKey, soundEnabled, vibrationEnabled);
        return parseAndroidAlertResult(raw, soundEnabled, vibrationEnabled);
      }
      if (android.previewRestAlert) {
        const raw = android.previewRestAlert(soundEnabled, vibrationEnabled);
        return parseAndroidAlertResult(raw, soundEnabled, vibrationEnabled);
      }
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
      return { soundPlayed: soundEnabled, vibrated: vibrationEnabled, blockedReasons: [] };
    } catch {
      // Fall through to web APIs.
    }
  }

  const soundPlayed = soundEnabled ? playRestChime() : false;
  const vibrated = vibrationEnabled ? triggerRestVibration() : false;
  return { soundPlayed, vibrated, blockedReasons: [] };
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
  // Include deadlineMs in the dedupe key so extending (+15s) or shortening (-15s)
  // produces a fresh alarm key while double-delivery for the same deadline stays deduplicated.
  const dedupeKey = `${timerKey}@${deadlineMs}`;
  const android = getAndroidAlerts();
  if (android?.scheduleRestTimer) {
    try {
      android.scheduleRestTimer(dedupeKey, deadlineMs, soundEnabled, vibrationEnabled, title, body);
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
        key: dedupeKey,
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
