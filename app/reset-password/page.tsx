"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

const cardClass =
  "w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm";

function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const { error } = await authClient.resetPassword({ newPassword, token });

    if (error) {
      setError(error.message ?? "Could not reset your password. Request a new link.");
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <div className={cardClass}>
        <h1 className="text-xl font-semibold">Password changed</h1>
        <p role="status" className="text-sm text-green-700">
          Your password has been changed.
        </p>
        <p className="text-sm text-zinc-500">
          <Link href="/sign-in" className="font-medium text-zinc-900 underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={cardClass}>
      <h1 className="text-xl font-semibold">Choose a new password</h1>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">New password</span>
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-zinc-500">At least 8 characters.</span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Confirm password</span>
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
        {loading ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}

function ResetPasswordContent() {
  const token = useSearchParams().get("token");

  // Without a token there is nothing to submit; send the user to request a fresh link.
  if (!token) {
    return (
      <div className={cardClass}>
        <h1 className="text-xl font-semibold">Reset link invalid</h1>
        <p className="text-sm text-zinc-500">
          This password reset link is missing or has expired.
        </p>
        <p className="text-sm text-zinc-500">
          <Link href="/forgot-password" className="font-medium text-zinc-900 underline">
            Request a new link
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
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={null}>
        <ResetPasswordContent />
      </Suspense>
    </main>
  );
}
