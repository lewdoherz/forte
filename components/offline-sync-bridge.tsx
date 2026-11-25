"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import {
  OFFLINE_SYNC_EVENT,
  syncOfflineData,
  type OfflineSyncSnapshot,
} from "@/lib/offline-sync";

/**
 * Mounted inside the authenticated AppFrame.
 *
 * 1. Keeps IndexedDB warmed with the current account's exercises, routines, and
 *    recent workouts, and warms the service worker's `/offline-app` shell + thumbnails.
 * 2. Automatically flushes queued offline routines/workouts on load, on reconnect,
 *    and when returning to the foreground — refreshing the page once queued items sync.
 * 3. Surfaces a clear status banner whenever work is "Saved on this device" (pending,
 *    offline, or session expired) so the user always knows sync state.
 */
export function OfflineSyncBridge({ userId }: { userId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<OfflineSyncSnapshot | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let active = true;
    const updateOnline = () => setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    updateOnline();

    const onSyncEvent = (event: Event) => {
      const detail = (event as CustomEvent<OfflineSyncSnapshot>).detail;
      if (active && detail) setSnapshot(detail);
    };

    const run = async (refreshIfDrained: boolean) => {
      const result = await syncOfflineData(userId);
      if (!active) return;
      setSnapshot(result);
      if (refreshIfDrained && (result.flushedCount ?? 0) > 0 && result.pendingCount === 0) {
        router.refresh();
      }
    };

    const initialTimer = window.setTimeout(() => {
      void run(true);
    }, 150);

    const onOnline = () => {
      updateOnline();
      void run(true);
    };
    const onOffline = () => updateOnline();
    const onVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void run(true);
      }
    };

    window.addEventListener(OFFLINE_SYNC_EVENT, onSyncEvent);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      window.removeEventListener(OFFLINE_SYNC_EVENT, onSyncEvent);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per userId
  }, [userId]);

  useEffect(() => {
    if (!online || !snapshot || snapshot.pendingCount === 0 || snapshot.status === "auth_required") {
      return;
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void syncOfflineData(userId).then((res) => {
          setSnapshot(res);
          if ((res.flushedCount ?? 0) > 0 && res.pendingCount === 0) {
            router.refresh();
          }
        });
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [online, router, snapshot, userId]);

  const showBanner =
    !online ||
    (snapshot !== null &&
      (snapshot.pendingCount > 0 ||
        snapshot.status === "auth_required" ||
        snapshot.status === "error"));

  if (!showBanner) return null;

  const isAuth = snapshot?.status === "auth_required";
  const isSyncing = snapshot?.status === "syncing";
  const pendingCount = snapshot?.pendingCount ?? 0;

  return (
    <div
      role="status"
      className="mx-auto max-w-6xl px-4 pt-3 sm:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3.5 py-2.5 text-xs text-[var(--warning-text)]">
        <div className="min-w-0 flex-1">
          <span className="font-semibold">
            {isAuth
              ? t("offline.badge.authRequired")
              : isSyncing
                ? t("offline.badge.syncing")
                : !online
                  ? `${t("offline.status.offlineMode")} · ${t("offline.badge.local")}`
                  : t("offline.badge.local")}
          </span>
          {pendingCount > 0 ? (
            <span className="ml-2 opacity-90">
              ({t("offline.status.pendingCount", { count: pendingCount })})
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!online ? (
            <a
              href="/offline-app"
              className="rounded-lg border border-[var(--warning-border)] px-2.5 py-1 font-semibold hover:opacity-80"
            >
              {t("offline.status.offlineMode")}
            </a>
          ) : isAuth ? (
            <Link
              href="/sign-in"
              className="rounded-lg border border-[var(--warning-border)] px-2.5 py-1 font-semibold hover:opacity-80"
            >
              {t("offline.status.signInToSync")}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void syncOfflineData(userId).then((res) => { if (res.pendingCount === 0) router.refresh(); })}
              disabled={isSyncing}
              className="rounded-lg border border-[var(--warning-border)] px-2.5 py-1 font-semibold hover:opacity-80 disabled:opacity-50"
            >
              {t("offline.status.retrySync")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
