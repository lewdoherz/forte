"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { formatDuration } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n";
import {
  readThemePreference,
  saveThemePreference,
  THEME_EVENT,
  type ThemePreference,
} from "@/lib/theme";
import {
  DEFAULT_REST_PREFS,
  NATIVE_ALERT_STATUS_EVENT,
  openNativeExactAlarmSettings,
  openNativeNotificationSettings,
  readNativeRestAlertStatus,
  readRestPreferences,
  requestNativeNotificationPermission,
  REST_PREFS_EVENT,
  triggerRestCompletionAlert,
  writeRestPreferences,
  type AlertBlockReason,
  type NativeRestAlertStatus,
  type RestPreferences,
} from "@/lib/rest-prefs";

const REST_OPTIONS = [0, 30, 45, 60, 90, 120, 180, 300];
const THEME_OPTIONS: readonly ThemePreference[] = ["system", "light", "dark"];

function reasonMessageKey(reason: AlertBlockReason): MessageKey {
  switch (reason) {
    case "dnd":
      return "offline.rest.diag.dnd";
    case "silent":
      return "offline.rest.diag.silent";
    case "vibrate_mode":
      return "offline.rest.diag.vibrateMode";
    case "volume_zero":
      return "offline.rest.diag.volumeZero";
    case "notifications_off":
      return "offline.rest.diag.notificationsOff";
    case "channel_blocked":
      return "offline.rest.diag.channelBlocked";
    case "exact_alarm_off":
      return "offline.rest.diag.exactAlarmOff";
    case "no_vibrator":
      return "offline.rest.diag.noVibrator";
  }
}

export function DevicePreferences({
  userId,
  compact = false,
}: {
  userId?: string;
  compact?: boolean;
}) {
  const { locale, t } = useI18n();
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [rest, setRest] = useState<RestPreferences>(DEFAULT_REST_PREFS);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [nativeStatus, setNativeStatus] = useState<NativeRestAlertStatus | null>(null);

  const refreshNativeStatus = useCallback((prefs: RestPreferences) => {
    const status = readNativeRestAlertStatus(prefs.soundEnabled, prefs.vibrationEnabled);
    if (status) setNativeStatus(status);
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      setTheme(readThemePreference());
      const nextRest = readRestPreferences(userId);
      setRest(nextRest);
      refreshNativeStatus(nextRest);
    };
    const onNativeStatus = (event: Event) => {
      const detail = (event as CustomEvent<NativeRestAlertStatus>).detail;
      if (detail) setNativeStatus(detail);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncFromStorage();
    };
    const timer = window.setTimeout(syncFromStorage, 0);
    window.addEventListener(THEME_EVENT, syncFromStorage);
    window.addEventListener(REST_PREFS_EVENT, syncFromStorage);
    window.addEventListener(NATIVE_ALERT_STATUS_EVENT, onNativeStatus);
    window.addEventListener("focus", syncFromStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(THEME_EVENT, syncFromStorage);
      window.removeEventListener(REST_PREFS_EVENT, syncFromStorage);
      window.removeEventListener(NATIVE_ALERT_STATUS_EVENT, onNativeStatus);
      window.removeEventListener("focus", syncFromStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId, refreshNativeStatus]);

  const restOptions = REST_OPTIONS.includes(rest.defaultRestSeconds)
    ? REST_OPTIONS
    : [...REST_OPTIONS, rest.defaultRestSeconds].sort((a, b) => a - b);

  function selectTheme(next: ThemePreference) {
    setTheme(next);
    saveThemePreference(next);
  }

  function updateRest(patch: Partial<RestPreferences>) {
    const next = writeRestPreferences(userId, patch);
    setRest(next);
    setPreviewStatus(null);
    refreshNativeStatus(next);
  }

  function previewAlert() {
    if (!rest.soundEnabled && !rest.vibrationEnabled) {
      setPreviewStatus(t("account.rest.previewMuted"));
      return;
    }
    const result = triggerRestCompletionAlert({
      soundEnabled: rest.soundEnabled,
      vibrationEnabled: rest.vibrationEnabled,
    });
    refreshNativeStatus(rest);

    if (result.blockedReasons.length > 0 && !result.soundPlayed && !result.vibrated) {
      setPreviewStatus(
        t("offline.rest.previewBlocked", {
          reason: t(reasonMessageKey(result.blockedReasons[0])),
        }),
      );
      return;
    }
    if (result.soundPlayed && result.vibrated) {
      setPreviewStatus(t("offline.rest.previewBoth"));
    } else if (result.soundPlayed) {
      setPreviewStatus(t("offline.rest.previewSoundOnly"));
    } else if (result.vibrated) {
      const extra = result.blockedReasons.includes("vibrate_mode")
        ? ` ${t("offline.rest.diag.vibrateMode")}`
        : result.blockedReasons.includes("volume_zero")
          ? ` ${t("offline.rest.diag.volumeZero")}`
          : "";
      setPreviewStatus(`${t("offline.rest.previewVibrateOnly")}${extra}`);
    } else {
      setPreviewStatus(t("account.rest.previewed"));
    }
  }

  // Collect actionable diagnostics from the native platform so users know
  // immediately if a permission or system mode prevents rest alert delivery.
  const diagnostics: AlertBlockReason[] = [];
  if (nativeStatus && (rest.soundEnabled || rest.vibrationEnabled)) {
    if (nativeStatus.dndBlocking) diagnostics.push("dnd");
    if (nativeStatus.ringerMode === "silent") diagnostics.push("silent");
    else if (rest.soundEnabled && nativeStatus.ringerMode === "vibrate") diagnostics.push("vibrate_mode");
    else if (rest.soundEnabled && nativeStatus.notificationVolumeZero) diagnostics.push("volume_zero");
    if (!nativeStatus.notificationsEnabled || !nativeStatus.postNotificationsGranted) {
      diagnostics.push("notifications_off");
    } else if (nativeStatus.channelBlocked) {
      diagnostics.push("channel_blocked");
    }
    if (rest.vibrationEnabled && !nativeStatus.hasVibrator) diagnostics.push("no_vibrator");
    if (nativeStatus.platform === "android" && !nativeStatus.exactAlarmsAllowed) {
      diagnostics.push("exact_alarm_off");
    }
  }

  return (
    <section
      aria-labelledby="device-preferences-heading"
      className={
        compact
          ? "space-y-4"
          : "mt-6 space-y-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5"
      }
    >
      <div>
        <h2 id="device-preferences-heading" className="text-lg font-semibold">
          {t("account.preferences.title")}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {t("account.preferences.description")}
        </p>
      </div>

      {/* Appearance: System / Light / Dark */}
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">{t("account.appearance.title")}</h3>
          <p className="text-xs text-[var(--text-muted)]">{t("account.appearance.description")}</p>
        </div>
        <div
          role="radiogroup"
          aria-label={t("account.appearance.title")}
          className="grid grid-cols-3 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-1"
        >
          {THEME_OPTIONS.map((option) => {
            const active = theme === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => selectTheme(option)}
                className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors ${
                  active
                    ? "training-action shadow-xs"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t(`account.appearance.${option}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rest timer preferences: default duration + independent sound & vibration + preview */}
      <div className="space-y-4 border-t border-[var(--border-subtle)] pt-4">
        <div>
          <h3 className="text-sm font-semibold">{t("account.rest.title")}</h3>
          <p className="text-xs text-[var(--text-muted)]">{t("account.rest.description")}</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("account.rest.defaultDuration")}</span>
          <select
            aria-label={t("account.rest.defaultDuration")}
            value={rest.defaultRestSeconds}
            onChange={(event) => updateRest({ defaultRestSeconds: Number(event.target.value) })}
            className="training-input min-h-11 w-full rounded-xl px-3 text-sm"
          >
            {restOptions.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds === 0 ? t("logger.rest.off") : formatDuration(locale, seconds)}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("account.rest.sound")}</p>
              <p className="text-xs text-[var(--text-muted)]">{t("account.rest.soundHint")}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={rest.soundEnabled}
              aria-label={t("account.rest.sound")}
              onClick={() => updateRest({ soundEnabled: !rest.soundEnabled })}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
                rest.soundEnabled
                  ? "border-[var(--border-strong)] bg-[var(--accent)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full transition-transform ${
                  rest.soundEnabled
                    ? "translate-x-6 bg-[var(--accent-fg)]"
                    : "translate-x-1 bg-[var(--text-muted)]"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("account.rest.vibration")}</p>
              <p className="text-xs text-[var(--text-muted)]">{t("account.rest.vibrationHint")}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={rest.vibrationEnabled}
              aria-label={t("account.rest.vibration")}
              onClick={() => updateRest({ vibrationEnabled: !rest.vibrationEnabled })}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
                rest.vibrationEnabled
                  ? "border-[var(--border-strong)] bg-[var(--accent)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full transition-transform ${
                  rest.vibrationEnabled
                    ? "translate-x-6 bg-[var(--accent-fg)]"
                    : "translate-x-1 bg-[var(--text-muted)]"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={previewAlert}
            className="min-h-11 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
          >
            {t("account.rest.preview")}
          </button>
          {previewStatus ? (
            <p role="status" className="text-xs text-[var(--text-muted)]">
              {previewStatus}
            </p>
          ) : null}
        </div>

        {/* Native system setting / permission guidance whenever delivery would be blocked */}
        {diagnostics.length > 0 ? (
          <div
            role="status"
            className="space-y-2 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3.5 text-xs text-[var(--warning-text)]"
          >
            <ul className="space-y-1">
              {diagnostics.map((reason) => (
                <li key={reason}>• {t(reasonMessageKey(reason))}</li>
              ))}
            </ul>
            {nativeStatus?.platform === "android" ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {diagnostics.includes("notifications_off") ? (
                  <button
                    type="button"
                    onClick={() => requestNativeNotificationPermission()}
                    className="min-h-9 rounded-lg border border-[var(--warning-border)] px-3 font-semibold"
                  >
                    {t("offline.rest.diag.requestNotifications")}
                  </button>
                ) : null}
                {diagnostics.includes("notifications_off") ||
                diagnostics.includes("channel_blocked") ||
                diagnostics.includes("dnd") ? (
                  <button
                    type="button"
                    onClick={() => openNativeNotificationSettings()}
                    className="min-h-9 rounded-lg border border-[var(--warning-border)] px-3 font-semibold"
                  >
                    {t("offline.rest.diag.openNotifications")}
                  </button>
                ) : null}
                {diagnostics.includes("exact_alarm_off") ? (
                  <button
                    type="button"
                    onClick={() => openNativeExactAlarmSettings()}
                    className="min-h-9 rounded-lg border border-[var(--warning-border)] px-3 font-semibold"
                  >
                    {t("offline.rest.diag.openExactAlarms")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
