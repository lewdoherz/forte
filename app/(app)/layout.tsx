import type { ReactNode } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { getActiveWorkout } from "@/lib/workouts";
import { SignOutButton } from "@/components/sign-out-button";
import { BottomNav } from "@/components/bottom-nav";

/**
 * Protected application boundary. Every page under app/(app)/ requires an
 * authenticated session; otherwise this layout redirects to /sign-in.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const activeWorkout = await getActiveWorkout(db, session.user.id);

  return (
    <>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link href="/" className="text-base font-semibold">
            forte
          </Link>

          <nav className="hidden items-center gap-4 text-sm sm:flex" aria-label="Primary">
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

          <div className="ml-auto flex items-center gap-2">
            {activeWorkout ? (
              <Link
                href={`/workouts/${activeWorkout.id}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-amber-100 px-3 text-xs font-medium text-amber-900"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                <span className="max-w-24 truncate sm:max-w-52">{activeWorkout.title}</span>
                <span className="hidden sm:inline">· resume</span>
              </Link>
            ) : null}
            <Link
              href="/account"
              className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-100"
            >
              Account
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Bottom padding leaves room for the mobile bottom nav. */}
      <div className="pb-24 sm:pb-0">{children}</div>

      <BottomNav />
    </>
  );
}
