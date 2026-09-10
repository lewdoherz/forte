"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const cardClass =
  "w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm";

function VerifyEmailContent() {
  const error = useSearchParams().get("error");

  // Better Auth redirects here with `?error=...` when the token is invalid or
  // expired; the resend control lives on the account page.
  if (error) {
    return (
      <div className={cardClass}>
        <h1 className="text-xl font-semibold">Verification failed</h1>
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          We could not verify your email address. The link may have expired or already been used.
        </p>
        <Link
          href="/account"
          className="block w-full rounded-md bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white"
        >
          Resend verification email
        </Link>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <h1 className="text-xl font-semibold">Email verified</h1>
      <p role="status" className="text-sm text-green-700">
        Your email address has been verified.
      </p>
      <p className="text-sm text-zinc-500">
        <Link href="/sign-in" className="font-medium text-zinc-900 underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams needs a Suspense boundary or the production build fails.
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={null}>
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
