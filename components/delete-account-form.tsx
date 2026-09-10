"use client";

import { useActionState } from "react";
import type { AccountActionState } from "@/lib/account-actions";

type FormAction = (
  prev: AccountActionState | null,
  formData: FormData,
) => Promise<AccountActionState>;

/**
 * Deletion is irreversible and takes the training history with it, so it asks
 * for a typed word rather than a single click — a stray tap should not be able
 * to end an account.
 */
export function DeleteAccountForm({ action }: { action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  const error = state && "error" in state ? state.error : undefined;

  return (
    <form action={formAction} className="mt-4 space-y-3">
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">Type DELETE to confirm</span>
        <input
          name="confirmation"
          required
          autoComplete="off"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-md border border-red-300 bg-white px-4 text-sm font-medium text-red-700 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete account"}
      </button>
    </form>
  );
}
