"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import {
  OFFLINE_SYNC_EVENT,
  syncOfflineData,
  type OfflineSyncSnapshot,
} from "@/lib/offline-sync";
import {
  claimLocalGuestDataIntoAccount,
  discardLocalGuestData,
  readLocalGuestDataSummary,
  type LocalGuestDataSummary,
} from "@/lib/legacy-local-migration";

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
  const pathname = usePathname();
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<OfflineSyncSnapshot | null>(null);
  const [online, setOnline] = useState(true);
  const [guestSummary, setGuestSummary] = useState<LocalGuestDataSummary | null>(null);
  const [guestDismissed, setGuestDismissed] = useState(false);
  const [importingGuest, setImportingGuest] = useState(false);
  const [guestNotice, setGuestNotice] = useState<string | null>(null);
  const lastBootstrapPathRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void readLocalGuestDataSummary().then((summary) => {
      if (active && summary.hasAny) setGuestSummary(summary);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  async function handleImportGuestData() {
    setImportingGuest(true);
    try {
      await claimLocalGuestDataIntoAccount(userId);
      setGuestSummary(null);
      setGuestNotice(t("offline.guest.imported"));
      const res = await syncOfflineData(userId);
      setSnapshot(res);
      router.refresh();
    } finally {
      setImportingGuest(false);
    }
  }

  async function handleDiscardGuestData() {
    await discardLocalGuestData();
    setGuestSummary(null);
  }

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

  // Keep the offline IndexedDB snapshot fresh when navigating back to core hubs
  // after online edits (e.g. creating or editing a routine or finishing a workout).
  useEffect(() => {
    if (!online || !pathname) return;
    const isHub =
      pathname === "/" ||
      pathname === "/workout" ||
      pathname === "/routines" ||
      pathname === "/workouts" ||
      /^\/routines\/[0-9a-f-]{36}$/i.test(pathname);
    if (!isHub) {
      lastBootstrapPathRef.current = pathname;
      return;
    }
    if (lastBootstrapPathRef.current === null) {
      lastBootstrapPathRef.current = pathname;
      return;
    }
    if (lastBootstrapPathRef.current === pathname) return;
    lastBootstrapPathRef.current = pathname;
    void syncOfflineData(userId).then((res) => setSnapshot(res));
  }, [online, pathname, userId]);

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

  const showGuestPrompt = Boolean(guestSummary?.hasAny && !guestDismissed);
  if (!showBanner && !showGuestPrompt && !guestNotice) return null;

  const isAuth = snapshot?.status === "auth_required";
  const isSyncing = snapshot?.status === "syncing";
  const pendingCount = snapshot?.pendingCount ?? 0;

  return (
    <div
      role="status"
      className="mx-auto max-w-6xl space-y-2 px-4 pt-3 sm:px-6"
    >
      {guestNotice ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--badge-border)] bg-[var(--badge-bg)] px-3.5 py-2.5 text-xs font-medium text-[var(--badge-text)]">
          <span>{guestNotice}</span>
          <button
            type="button"
            onClick={() => setGuestNotice(null)}
            className="rounded px-2 py-0.5 hover:opacity-80"
          >
            ✕
          </button>
        </div>
      ) : null}

      {showGuestPrompt && guestSummary ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-3 text-xs">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[var(--text-primary)]">
              {t("offline.guest.bannerTitle")}
            </p>
            <p className="mt-0.5 text-[var(--text-muted)]">
              {t("offline.guest.bannerBody", {
                workouts: guestSummary.workoutCount,
                routines: guestSummary.routineCount,
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={importingGuest}
              onClick={() => void handleImportGuestData()}
              className="training-action min-h-9 rounded-lg px-3 font-bold disabled:opacity-50"
            >
              {importingGuest ? t("offline.guest.importing") : t("offline.guest.import")}
            </button>
            <button
              type="button"
              onClick={() => setGuestDismissed(true)}
              className="min-h-9 rounded-lg border border-[var(--border-subtle)] px-3 font-semibold hover:bg-[var(--bg-surface-hover)]"
            >
              {t("offline.guest.keepSeparate")}
            </button>
            <button
              type="button"
              onClick={() => void handleDiscardGuestData()}
              className="min-h-9 rounded-lg px-2.5 font-semibold text-[var(--danger-text)] hover:bg-[var(--danger-bg)]"
            >
              {t("offline.guest.discard")}
            </button>
          </div>
        </div>
      ) : null}

      {showBanner ? (
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
      ) : null}
    </div>
  );
}
