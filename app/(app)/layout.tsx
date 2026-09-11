import type { ReactNode } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { getActiveWorkout } from "@/lib/workouts";
import { BottomNav } from "@/components/bottom-nav";
import { Sidebar } from "@/components/sidebar";

/**
 * Protected application boundary. Every page under app/(app)/ requires an
 * authenticated session; otherwise this layout redirects to /sign-in.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const activeWorkout = await getActiveWorkout(db, session.user.id);
  // Better Auth maps `name` to app_user.display_name (see lib/auth.ts). The
  // column is nullable, so fall back to the email rather than render a blank
  // account row.
  const displayName = session.user.name.trim() || session.user.email;

  return (
    <>
      <Sidebar displayName={displayName} activeWorkout={activeWorkout ?? null} />

      {/* Below `sm` the sidebar is hidden, so the top bar stays as the place to
          reach the wordmark, the active-workout chip and the account link on a
          phone. Sign-out lives on /account only, from every breakpoint. */}
      <header className="border-b border-zinc-200 bg-white sm:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link href="/" className="text-base font-semibold">
            forte
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {activeWorkout ? (
              <Link
                href={`/workouts/${activeWorkout.id}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-amber-100 px-3 text-xs font-medium text-amber-900"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                <span className="max-w-24 truncate">{activeWorkout.title}</span>
              </Link>
            ) : null}
            <Link
              href="/account"
              className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-100"
            >
              Account
            </Link>
          </div>
        </div>
      </header>

      {/* Bottom padding leaves room for the mobile bottom nav; from `sm` up the
          left padding matches the fixed sidebar (w-64) so content never sits
          under it and the page cannot scroll horizontally. */}
      <div className="pb-24 sm:pb-0 sm:pl-64">{children}</div>

      <BottomNav />
    </>
  );
}
