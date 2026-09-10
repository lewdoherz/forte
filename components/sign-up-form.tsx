"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email) {
      setError("Email is required.");
      setLoading(false);
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    // Better Auth's email signup requires a `name` (mapped to display_name).
    // Derive a default display name from the email; changeable in onboarding.
    const { error } = await authClient.signUp.email({
      email,
      password,
      name: email.split("@")[0] ?? email,
    });

    if (error) {
      setError(error.message ?? "Could not create your account.");
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
      <h1 className="text-xl font-semibold">Create your account</h1>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

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

      <label className="block space-y-1">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-zinc-500">At least 8 characters.</span>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Creating account…" : "Sign up"}
      </button>

      <p className="text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-zinc-900 underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
