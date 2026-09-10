"use client";

import { useActionState } from "react";
import type { AccountActionState } from "@/lib/account-actions";

type FormAction = (
  prev: AccountActionState | null,
  formData: FormData,
) => Promise<AccountActionState>;

interface AccountFormProps {
  action: FormAction;
  initial: { email: string; displayName: string; timeZone: string };
  submitLabel: string;
}

export function AccountForm({ action, initial, submitLabel }: AccountFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const error = state && "error" in state ? state.error : undefined;
  const saved = state !== null && "ok" in state && state.ok;

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">Email</span>
        <input
          value={initial.email}
          readOnly
          className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Display name</span>
        <input
          name="displayName"
          defaultValue={initial.displayName}
          required
          maxLength={80}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Timezone</span>
        <input
          name="timeZone"
          defaultValue={initial.timeZone}
          required
          maxLength={64}
          placeholder="America/Chicago"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <span className="block text-xs text-zinc-500">
          IANA timezone name (e.g. America/Chicago), used for date and progress bucketing.
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>

      {saved ? (
        <p role="status" className="text-sm text-green-700">
          Saved.
        </p>
      ) : null}
    </form>
  );
}
