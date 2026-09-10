import type { ReactNode } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/auth-session";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Protected application boundary. Every page under app/(app)/ requires an
 * authenticated session; otherwise this layout redirects to /sign-in.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/" className="font-semibold">
            forte
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/routines" className="hover:underline">
              Routines
            </Link>
            <Link href="/exercises" className="hover:underline">
              Exercises
            </Link>
            <Link href="/workouts" className="hover:underline">
              Workouts
            </Link>
            <Link href="/progress" className="hover:underline">
              Progress
            </Link>
          </nav>
          <div className="ml-auto">
            <SignOutButton />
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
