"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    if (!email) {
      setError("Email is required.");
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
      setError(error.message ?? "Could not send the reset link. Try again.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Reset your password</h1>

        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {sent ? (
          <p role="status" className="text-sm text-green-700">
            If an account exists for that email, a reset link is on its way.
          </p>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Email</span>
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
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </>
        )}

        <p className="text-sm text-zinc-500">
          Remembered it?{" "}
          <Link href="/sign-in" className="font-medium text-zinc-900 underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
