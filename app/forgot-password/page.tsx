"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";

/**
 * Better Auth replies with an English `message` and a stable `code` — the latter
 * arrives at runtime but is missing from the client's declared error type, so it
 * is read through a cast. Mapping the code is what keeps the alert localized; an
 * unrecognized code falls back to the line this form used before, so the
 * server's English text is never rendered.
 */
function forgotPasswordErrorKey(error: unknown): MessageKey {
  switch (String((error as { code?: unknown } | null)?.code)) {
    case "INVALID_EMAIL":
      return "auth.error.invalidEmail";
    default:
      return "auth.error.resetLinkFailed";
  }
}

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    if (!email) {
      setErrorKey("auth.error.emailRequired");
      setLoading(false);
      return;
    }

    // Better Auth answers identically for known and unknown addresses, so the
    // confirmation below must not branch on the response — branching would leak
    // whether an account exists.
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });

    if (error) {
      setErrorKey(forgotPasswordErrorKey(error));
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <>
      <div className="fixed right-4 top-4">
        {/* Someone who cannot read the current language must be able to switch
            before signing in. */}
        <LanguageSwitcher compact />
      </div>
      <main className="flex min-h-screen items-center justify-center px-4">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <h1 className="text-xl font-semibold">{t("auth.forgotPassword.title")}</h1>

          {errorKey ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {t(errorKey)}
            </p>
          ) : null}

          {sent ? (
            <p role="status" className="text-sm text-green-700">
              {t("auth.forgotPassword.sent")}
            </p>
          ) : (
            <>
              <label className="block space-y-1">
                <span className="text-sm font-medium">{t("auth.field.email")}</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {loading
                  ? t("auth.forgotPassword.sending")
                  : t("auth.forgotPassword.submit")}
              </button>
            </>
          )}

          <p className="text-sm text-zinc-500">
            {t("auth.forgotPassword.remembered")}{" "}
            <Link href="/sign-in" className="font-medium text-zinc-900 underline">
              {t("common.signIn")}
            </Link>
          </p>
        </form>
      </main>
    </>
  );
}
