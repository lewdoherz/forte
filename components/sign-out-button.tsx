"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

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
      className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-100"
    >
      Sign out
    </button>
  );
}
