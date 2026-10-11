"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { prepareOfflineDataForUser } from "@/lib/offline-store";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";

/**
 * Better Auth replies with an English `message` and a stable `code` — the latter
 * arrives at runtime but is missing from the client's declared error type, so it
 * is read through a cast. Mapping the code is what keeps the alert localized; an
 * unrecognized code falls back to the line this form used before, so the
 * server's English text is never rendered.
 */
function signInErrorKey(error: unknown): MessageKey {
  switch (String((error as { code?: unknown } | null)?.code)) {
    case "EMAIL_NOT_VERIFIED":
      return "auth.error.emailNotVerified";
    case "INVALID_EMAIL":
      return "auth.error.invalidEmail";
    default:
      return "auth.error.invalidCredentials";
  }
}

export function SignInForm() {
  const router = useRouter();
  const { t } = useI18n();
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !password) {
      setErrorKey("auth.signIn.missingFields");
      setLoading(false);
      return;
    }

    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setErrorKey(signInErrorKey(result.error));
      setLoading(false);
      return;
    }

    try {
      await prepareOfflineDataForUser(result.data.user.id);
    } catch {
      // Fail closed: entering the authenticated app while another account's
      // offline data may still be present is worse than requiring another try.
      await authClient.signOut();
      setErrorKey("auth.error.offlinePreparationFailed");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold">{t("common.signIn")}</h1>

      {errorKey ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(errorKey)}
        </p>
      ) : null}

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

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("auth.field.password")}</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? t("auth.signIn.submitting") : t("common.signIn")}
      </button>

      <p className="text-sm text-zinc-500">
        {t("auth.signIn.noAccount")}{" "}
        <Link href="/sign-up" className="font-medium text-zinc-900 underline">
          {t("common.signUp")}
        </Link>
      </p>
    </form>
  );
}
