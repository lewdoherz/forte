"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { clearOfflineClientData } from "@/lib/offline-store";

/**
 * Sign-out control for the account page. It stays a client component even
 * though that page is its only caller: the page is a server component, so the
 * `useRouter` state and the `signOut()` call have to sit behind a client
 * boundary. Styled as a red outline to match `DeleteAccountForm`, so the page
 * reads as one destructive-action family rather than two different reds.
 */
export function SignOutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          setError(null);
          try {
            // Clear while the authenticated page and its controlling worker are
            // still available. If isolation cannot be guaranteed, keep the
            // session rather than leave private data behind after signing out.
            await clearOfflineClientData();
          } catch {
            setError("Could not clear offline workout data. Sign-out was stopped.");
            return;
          }
          await authClient.signOut();
          router.push("/sign-in");
          router.refresh();
        }}
        className="h-11 rounded-md border border-red-300 bg-white px-4 text-sm font-medium text-red-700"
      >
        Sign out
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
