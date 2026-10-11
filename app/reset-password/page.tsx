"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";

const cardClass =
  "w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm";

/**
 * Better Auth replies with an English `message` and a stable `code` — the latter
 * arrives at runtime but is missing from the client's declared error type, so it
 * is read through a cast. Mapping the code is what keeps the alert localized; an
 * unrecognized code falls back to the line this form used before, so the
 * server's English text is never rendered.
 */
function resetPasswordErrorKey(error: unknown): MessageKey {
  switch (String((error as { code?: unknown } | null)?.code)) {
    case "INVALID_TOKEN":
      return "auth.error.invalidToken";
    case "TOKEN_EXPIRED":
      return "auth.error.tokenExpired";
    case "PASSWORD_TOO_SHORT":
      return "auth.error.passwordTooShort";
    default:
      return "auth.error.resetFailed";
  }
}

function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useI18n();
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword.length < 8) {
      setErrorKey("auth.error.passwordTooShort");
      setLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorKey("auth.error.passwordMismatch");
      setLoading(false);
      return;
    }

    const { error } = await authClient.resetPassword({ newPassword, token });

    if (error) {
      setErrorKey(resetPasswordErrorKey(error));
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <div className={cardClass}>
        <h1 className="text-xl font-semibold">{t("auth.resetPassword.doneTitle")}</h1>
        <p role="status" className="text-sm text-green-700">
          {t("auth.resetPassword.doneText")}
        </p>
        <p className="text-sm text-zinc-500">
          <Link href="/sign-in" className="font-medium text-zinc-900 underline">
            {t("common.signIn")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={cardClass}>
      <h1 className="text-xl font-semibold">{t("auth.resetPassword.title")}</h1>

      {errorKey ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(errorKey)}
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("auth.field.newPassword")}</span>
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-zinc-500">{t("auth.password.rule")}</span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("auth.field.confirmPassword")}</span>
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? t("common.saving") : t("auth.resetPassword.submit")}
      </button>
    </form>
  );
}

function ResetPasswordContent() {
  const { t } = useI18n();
  const token = useSearchParams().get("token");

  // Without a token there is nothing to submit; send the user to request a fresh link.
  if (!token) {
    return (
      <div className={cardClass}>
        <h1 className="text-xl font-semibold">
          {t("auth.resetPassword.invalidTitle")}
        </h1>
        <p className="text-sm text-zinc-500">{t("auth.resetPassword.invalidText")}</p>
        <p className="text-sm text-zinc-500">
          <Link href="/forgot-password" className="font-medium text-zinc-900 underline">
            {t("auth.resetPassword.requestNew")}
          </Link>
        </p>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary or the production build fails.
  return (
    <>
      <div className="fixed right-4 top-4">
        {/* Someone who cannot read the current language must be able to switch
            before signing in. */}
        <LanguageSwitcher compact />
      </div>
      <main className="flex min-h-screen items-center justify-center px-4">
        <Suspense fallback={null}>
          <ResetPasswordContent />
        </Suspense>
      </main>
    </>
  );
}
