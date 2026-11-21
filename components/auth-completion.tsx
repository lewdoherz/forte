"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { prepareOfflineDataForUser } from "@/lib/offline-store";
import { useI18n } from "@/lib/i18n/context";

type CompletionStatus = "preparing" | "signed-out" | "sign-out-failed" | "signing-out";

export function AuthCompletion({ userId }: { userId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const preparation = useRef<Promise<void> | null>(null);
  const signOutPending = useRef(false);
  const [status, setStatus] = useState<CompletionStatus>("preparing");

  const signOut = useCallback(async () => {
    try {
      const result = await authClient.signOut();
      return !result.error;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Reuse the preparation during React's effect replay; never start two
    // competing owner changes for the same OAuth completion.
    preparation.current ??= prepareOfflineDataForUser(userId);
    const pendingPreparation = preparation.current;

    async function complete() {
      try {
        await pendingPreparation;
      } catch {
        if (!active) return;
        // No app navigation is allowed after an offline isolation failure.
        const signedOut = await signOut();
        if (active) setStatus(signedOut ? "signed-out" : "sign-out-failed");
        return;
      }
      if (!active) return;
      router.replace("/");
      router.refresh();
    }

    void complete();
    return () => {
      active = false;
    };
  }, [router, signOut, userId]);

  async function retrySignOut() {
    if (signOutPending.current) return;
    signOutPending.current = true;
    setStatus("signing-out");
    const signedOut = await signOut();
    setStatus(signedOut ? "signed-out" : "sign-out-failed");
    signOutPending.current = false;
  }

  const failed = status !== "preparing";
  return (
    <section className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">{t("auth.complete.title")}</h1>
      {failed ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(
            status === "signed-out"
              ? "auth.error.offlinePreparationFailed"
              : "auth.error.completionSignOutFailed",
          )}
        </p>
      ) : (
        <p role="status" className="text-sm text-zinc-500">
          {t("auth.complete.preparing")}
        </p>
      )}
      {status === "sign-out-failed" || status === "signing-out" ? (
        <button
          type="button"
          disabled={status === "signing-out"}
          onClick={retrySignOut}
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {t("auth.complete.retrySignOut")}
        </button>
      ) : null}
      {status === "signed-out" ? (
        <>
          <Link href="/sign-in" className="block text-sm font-medium text-zinc-900 underline">
            {t("auth.complete.back")}
          </Link>
        </>
      ) : null}
    </section>
  );
}
