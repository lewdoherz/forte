"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/context";

/**
 * Wraps online-only account actions on `/account`. When the device is offline,
 * it renders a clear status notice and disables network-dependent forms while
 * keeping local device preferences (Appearance and Rest timer) usable.
 */
export function AccountOnlineGuard({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const initial = window.setTimeout(sync, 0);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <div className="mt-8">
      {!online ? (
        <div
          role="status"
          className="mb-6 rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-sm text-[var(--warning-text)]"
        >
          <p className="font-medium">{t("account.offline.banner")}</p>
          <p className="mt-1 text-xs opacity-90">{t("account.offline.requiresConnection")}</p>
        </div>
      ) : null}
      <fieldset disabled={!online} className={!online ? "opacity-60" : ""}>
        {children}
      </fieldset>
    </div>
  );
}
