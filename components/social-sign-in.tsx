"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n/context";
import { isEmbeddedAuthUserAgent, providerNames, type SocialProviderId } from "@/lib/social-auth";

const providerOrder: SocialProviderId[] = ["google", "apple", "facebook", "linkedin"];

export function SocialSignIn({
  providers,
  disabled = false,
  busyRef,
  onPendingChange,
  callbackURL = "/auth/complete",
  errorCallbackURL = "/sign-in?social=error",
}: {
  providers: SocialProviderId[];
  disabled?: boolean;
  busyRef?: RefObject<boolean>;
  onPendingChange?: (pending: boolean) => void;
  callbackURL?: string;
  errorCallbackURL?: string;
}) {
  const { t } = useI18n();
  const pending = useRef(false);
  const nativePending = useRef(false);
  const [loading, setLoading] = useState<SocialProviderId | null>(null);
  const [failed, setFailed] = useState(false);
  const available = providerOrder.filter((provider) => providers.includes(provider));

  useEffect(() => {
    function release() {
      nativePending.current = false;
      pending.current = false;
      if (busyRef) busyRef.current = false;
      setLoading(null);
      setFailed(true);
      onPendingChange?.(false);
    }
    function cancelled() {
      if (nativePending.current) release();
    }
    function restored(event: PageTransitionEvent) {
      if (event.persisted && pending.current && !nativePending.current) release();
    }
    window.addEventListener("forte:auth-cancelled", cancelled);
    window.addEventListener("pageshow", restored);
    return () => {
      window.removeEventListener("forte:auth-cancelled", cancelled);
      window.removeEventListener("pageshow", restored);
    };
  }, [busyRef, onPendingChange]);

  async function signIn(provider: SocialProviderId) {
    if (disabled || pending.current || busyRef?.current) return;
    pending.current = true;
    if (busyRef) busyRef.current = true;
    setLoading(provider);
    setFailed(false);
    onPendingChange?.(true);

    try {
      if (/ForteAndroid\/1|ForteIOS\/1/.test(navigator.userAgent)) {
        nativePending.current = true;
        // Next's client router bypasses the native navigation delegate.
        window.location.assign(new URL(`/auth/native/start?provider=${provider}`, window.location.origin).href);
        return;
      }
      if (isEmbeddedAuthUserAgent(navigator.userAgent)) throw new Error("Use an updated Forte app or system browser.");
      const result = await authClient.signIn.social({
        provider,
        callbackURL,
        errorCallbackURL,
      });
      if (result.error) throw new Error("Social sign-in failed");
      // Keep email and every provider disabled until the OAuth redirect.
    } catch {
      nativePending.current = false;
      pending.current = false;
      if (busyRef) busyRef.current = false;
      setLoading(null);
      setFailed(true);
      onPendingChange?.(false);
    }
  }

  if (available.length === 0) return null;

  return (
    <div className="space-y-3">
      {failed ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("auth.error.socialFailed")}
        </p>
      ) : null}
      <div className="space-y-2" role="group" aria-label={t("auth.social.methods")}>
        {available.map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={disabled || loading !== null}
            onClick={() => void signIn(provider)}
            className={`flex min-h-11 w-full items-center justify-center gap-3 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60 ${
              provider === "google"
                ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
                : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
            }`}
          >
            <span aria-hidden="true" className="inline-flex h-6 min-w-6 items-center justify-center font-bold">
              {provider === "google" ? "G" : provider === "apple" ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" focusable="false">
                  <path d="M14 6c0-2 1-4 4-5 0 3-2 5-4 5Zm-2 2c-3-2-6-1-7 2-2 5 2 12 5 12 1 0 2-1 3-1s2 1 3 1c2 0 4-3 5-6-4-1-5-6-1-8-2-2-5-2-8 0Z" />
                </svg>
              ) : provider === "facebook" ? "f" : "in"}
            </span>
            {t(loading === provider ? "auth.social.redirecting" : "auth.social.continue", {
              provider: providerNames[provider],
            })}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-zinc-200" />
        <span>{t("auth.social.orEmail")}</span>
        <span className="h-px flex-1 bg-zinc-200" />
      </div>
    </div>
  );
}
