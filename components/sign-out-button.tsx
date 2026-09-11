"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * Sign-out control for the account page. It stays a client component even
 * though that page is its only caller: the page is a server component, so the
 * `useRouter` state and the `signOut()` call have to sit behind a client
 * boundary. Styled as a red outline to match `DeleteAccountForm`, so the page
 * reads as one destructive-action family rather than two different reds.
 */
export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push("/sign-in");
        router.refresh();
      }}
      className="h-11 rounded-md border border-red-300 bg-white px-4 text-sm font-medium text-red-700"
    >
      Sign out
    </button>
  );
}
