"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { formatDuration } from "@/lib/i18n/format";
import {
  readThemePreference,
  saveThemePreference,
  THEME_EVENT,
  type ThemePreference,
} from "@/lib/theme";
import {
  DEFAULT_REST_PREFS,
  readRestPreferences,
  REST_PREFS_EVENT,
  triggerRestCompletionAlert,
  writeRestPreferences,
  type RestPreferences,
} from "@/lib/rest-prefs";

const REST_OPTIONS = [0, 30, 45, 60, 90, 120, 180, 300];
const THEME_OPTIONS: readonly ThemePreference[] = ["system", "light", "dark"];

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

  useEffect(() => {
    const syncFromStorage = () => {
      setTheme(readThemePreference());
      setRest(readRestPreferences(userId));
    };
    const timer = window.setTimeout(syncFromStorage, 0);
    window.addEventListener(THEME_EVENT, syncFromStorage);
    window.addEventListener(REST_PREFS_EVENT, syncFromStorage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(THEME_EVENT, syncFromStorage);
      window.removeEventListener(REST_PREFS_EVENT, syncFromStorage);
    };
  }, [userId]);

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
  }

  function previewAlert() {
    if (!rest.soundEnabled && !rest.vibrationEnabled) {
      setPreviewStatus(t("account.rest.previewMuted"));
      return;
    }
    triggerRestCompletionAlert({
      soundEnabled: rest.soundEnabled,
      vibrationEnabled: rest.vibrationEnabled,
    });
    setPreviewStatus(t("account.rest.previewed"));
  }

  return (
    <section
      aria-labelledby="device-preferences-heading"
      className={compact ? "space-y-4" : "mt-6 space-y-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5"}
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
      </div>
    </section>
  );
}
