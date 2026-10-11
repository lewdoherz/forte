"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/context";

const cardClass =
  "w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm";

function VerifyEmailContent() {
  const { t } = useI18n();
  const error = useSearchParams().get("error");

  // Better Auth redirects here with `?error=...` when the token is invalid or
  // expired; the resend control lives on the account page.
  if (error) {
    return (
      <div className={cardClass}>
        <h1 className="text-xl font-semibold">{t("auth.verifyEmail.failedTitle")}</h1>
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("auth.verifyEmail.failedText")}
        </p>
        <Link
          href="/account"
          className="block w-full rounded-md bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white"
        >
          {t("auth.verifyEmail.resend")}
        </Link>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <h1 className="text-xl font-semibold">{t("auth.verifyEmail.verifiedTitle")}</h1>
      <p role="status" className="text-sm text-green-700">
        {t("auth.verifyEmail.verifiedText")}
      </p>
      <p className="text-sm text-zinc-500">
        <Link href="/sign-in" className="font-medium text-zinc-900 underline">
          {t("common.signIn")}
        </Link>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
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
          <VerifyEmailContent />
        </Suspense>
      </main>
    </>
  );
}
