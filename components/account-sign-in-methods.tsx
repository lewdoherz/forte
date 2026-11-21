"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n/context";
import { providerNames, type SocialProviderId } from "@/lib/social-auth";

const providerOrder: SocialProviderId[] = ["google", "apple", "facebook", "linkedin"];

export function AccountSignInMethods({
  linkedProviderIds,
  providers,
  canRecoverPassword,
  missingContactEmail,
  socialError = false,
  native = false,
}: {
  linkedProviderIds: string[];
  providers: SocialProviderId[];
  canRecoverPassword: boolean;
  missingContactEmail: boolean;
  socialError?: boolean;
  native?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const pending = useRef(false);
  const [loading, setLoading] = useState<SocialProviderId | null>(null);
  const [failed, setFailed] = useState(socialError);
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "sending" | "sent" | "error" | "reauth"
  >("idle");
  const linked = [...new Set(linkedProviderIds)];
  const available = providerOrder.filter(
    (provider) => providers.includes(provider) && !linked.includes(provider),
  );
  const hasPassword = linked.includes("credential");

  useEffect(() => {
    function restored(event: PageTransitionEvent) {
      if (!event.persisted || !pending.current) return;
      pending.current = false;
      setLoading(null);
      setFailed(true);
    }
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  async function link(provider: SocialProviderId) {
    if (pending.current) return;
    // Browser reauthentication and explicit linking happen outside the webview.
    if (/ForteAndroid\/1|ForteIOS\/1/.test(navigator.userAgent)) {
      // A hard navigation is required for the shell's navigation delegate.
      window.location.assign(new URL("/auth/native/manage", window.location.origin).href);
      return;
    }
    pending.current = true;
    setLoading(provider);
    setFailed(false);
    try {
      const result = await authClient.linkSocial({
        provider,
        callbackURL: "/account",
        errorCallbackURL: "/account?social=error",
      });
      if (result.error) throw new Error("Account linking failed");
      // The callback reloads the server-rendered account list after linking.
    } catch {
      pending.current = false;
      setLoading(null);
      setFailed(true);
    }
  }

  async function requestContactEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = new FormData(event.currentTarget);
    const newEmail = String(form.get("newEmail") ?? "").trim();
    if (!newEmail) return;
    pending.current = true;
    setEmailStatus("sending");
    try {
      const result = await authClient.changeEmail({
        newEmail,
        callbackURL: "/account",
      });
      if (result.error) {
        const error = result.error as { code?: unknown; status?: unknown };
        const needsReauthentication =
          error.status === 401 ||
          ["UNAUTHORIZED", "SESSION_NOT_FRESH", "SESSION_EXPIRED", "FAILED_TO_GET_SESSION"].includes(
            String(error.code),
          );
        setEmailStatus(needsReauthentication ? "reauth" : "error");
        return;
      }
      setEmailStatus("sent");
    } catch {
      setEmailStatus("error");
    } finally {
      pending.current = false;
    }
  }

  return (
    <section className="mt-10 border-t border-zinc-200 pt-6" aria-labelledby="sign-in-methods-title">
      <h2 id="sign-in-methods-title" className="text-lg font-semibold">
        {t("account.methods.title")}
      </h2>
      <p className="mt-2 text-sm text-zinc-600">{t("account.methods.description")}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {linked.map((provider) => (
          <li key={provider} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2">
            <span>
              {provider === "credential"
                ? t("account.methods.emailPassword")
                : providerOrder.includes(provider as SocialProviderId)
                  ? providerNames[provider as SocialProviderId]
                  : t("account.methods.otherProvider")}
            </span>
            <span className="text-zinc-500">{t("account.methods.connected")}</span>
          </li>
        ))}
      </ul>
      {canRecoverPassword ? (
        <Link href="/forgot-password" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium underline">
          {t(hasPassword ? "account.methods.resetPassword" : "account.methods.setPassword")}
        </Link>
      ) : (
        <p className="mt-3 text-sm text-zinc-600">{t("account.methods.passwordNeedsEmail")}</p>
      )}
      {missingContactEmail ? (
        <form onSubmit={requestContactEmail} className="mt-4 space-y-3 rounded-md border border-zinc-200 p-4">
          <p className="text-sm text-zinc-600">{t("account.methods.addEmailDescription")}</p>
          <label htmlFor="recovery-contact-email" className="block space-y-1">
            <span className="text-sm font-medium">{t("account.methods.contactEmail")}</span>
            <input
              id="recovery-contact-email"
              name="newEmail"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              disabled={loading !== null || emailStatus === "sending"}
              className="min-h-11 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-60"
            />
          </label>
          <button
            type="submit"
            disabled={loading !== null || emailStatus === "sending"}
            className="min-h-11 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
          >
            {t(emailStatus === "sending" ? "account.methods.emailSending" : "account.methods.sendEmailVerification")}
          </button>
          {emailStatus === "sent" ? (
            <>
              <p role="status" className="text-sm text-zinc-600">{t("account.methods.emailSent")}</p>
              <button type="button" onClick={() => router.refresh()} className="inline-flex min-h-11 items-center text-sm font-medium underline">
                {t("account.methods.refreshEmail")}
              </button>
            </>
          ) : emailStatus === "error" || emailStatus === "reauth" ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {t(emailStatus === "reauth" ? "account.methods.emailReauth" : "account.methods.emailError")}
            </p>
          ) : null}
        </form>
      ) : null}
      {failed ? (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("account.methods.linkFailed")}
        </p>
      ) : null}
      {native && providers.length > 0 ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-zinc-600">{t("account.methods.nativeInstructions")}</p>
          <a href="/auth/native/manage" className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50">
            {t("account.methods.manageInBrowser")}
          </a>
          <button type="button" onClick={() => router.refresh()} className="ml-3 inline-flex min-h-11 items-center text-sm font-medium underline">
            {t("account.methods.refresh")}
          </button>
        </div>
      ) : available.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-zinc-600">{t("account.methods.linkDescription")}</p>
          {available.map((provider) => (
            <button
              key={provider}
              type="button"
              disabled={loading !== null || emailStatus === "sending"}
              onClick={() => void link(provider)}
              className="flex min-h-11 w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
            >
              {t(loading === provider ? "account.methods.linking" : "account.methods.link", {
                provider: providerNames[provider],
              })}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
