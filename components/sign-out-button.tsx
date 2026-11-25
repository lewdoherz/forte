"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { clearOfflineClientData, readActivePendingCount } from "@/lib/offline-store";
import { OFFLINE_SYNC_EVENT, syncOfflineData } from "@/lib/offline-sync";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";

/**
 * Sign-out control for the account page. Clears the active offline cache and
 * private SW routes while vaulting any unsynced workouts/routines privately to
 * the originating account so signing out never silently discards offline work.
 */
export function SignOutButton() {
  const router = useRouter();
  const { t } = useI18n();
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void readActivePendingCount().then((count) => {
        if (active) setPendingCount(count);
      });
    };
    refresh();
    window.addEventListener(OFFLINE_SYNC_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(OFFLINE_SYNC_EVENT, refresh);
    };
  }, []);

  return (
    <div className="space-y-3">
      {pendingCount > 0 ? (
        <div
          role="status"
          className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-xs text-[var(--warning-text)]"
        >
          <p>{t("account.signOut.pendingPreserved", { count: pendingCount })}</p>
          <button
            type="button"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                const snap = await syncOfflineData();
                setPendingCount(snap.pendingCount);
              } finally {
                setSyncing(false);
              }
            }}
            className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-[var(--warning-border)] px-3 font-semibold hover:opacity-80 disabled:opacity-50"
          >
            {syncing ? t("offline.badge.syncing") : t("account.signOut.syncNow")}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={async () => {
          setErrorKey(null);
          try {
            // Preserve unsynced pending edits in this account's private vault,
            // then wipe active IndexedDB and private SW caches before sign-out.
            await clearOfflineClientData();
          } catch {
            setErrorKey("auth.error.offlineClearFailed");
            return;
          }
          await authClient.signOut();
          router.push("/sign-in");
          router.refresh();
        }}
        className="h-11 rounded-md border border-red-300 bg-white px-4 text-sm font-medium text-red-700"
      >
        {t("common.signOut")}
      </button>
      {errorKey ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
