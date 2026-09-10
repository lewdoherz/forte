import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth-server";
import { requireSession, requireSessionUserId } from "@/lib/auth-session";
import { getUserProfile } from "@/lib/users";
import { updateAccount } from "@/lib/account-actions";
import { AccountForm } from "@/components/account-form";
import { SessionList, type ActiveSession } from "@/components/session-list";

export default async function AccountPage() {
  const userId = await requireSessionUserId();
  const profile = await getUserProfile(db, userId);

  // A session without a row should not exist (session.user.id === app_user.id);
  // recover through sign-in rather than render a form with nothing to write to.
  if (!profile) {
    redirect("/sign-in");
  }

  // The current session is identified by its token so the list can mark it and
  // refuse to offer a "sign out" that would immediately sign the user back out of
  // the page they are looking at.
  const session = await requireSession();
  const currentToken = session.session.token;
  const sessions = await auth.api.listSessions({ headers: await headers() });

  const activeSessions: ActiveSession[] = sessions.map((entry) => ({
    id: entry.id,
    // The output parser filters fields, so the token is treated as absent rather
    // than assumed — without it, only "sign out everywhere else" is offered.
    token: "token" in entry && typeof entry.token === "string" ? entry.token : null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
    createdAt: new Date(entry.createdAt),
    expiresAt: new Date(entry.expiresAt),
  }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" className="text-sm text-zinc-500 underline">
        ← Home
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Account</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Your display name is shown across the app; your timezone controls how dates and progress are bucketed.
      </p>

      <AccountForm
        action={updateAccount}
        initial={{
          email: profile.email,
          displayName: profile.display_name ?? "",
          timeZone: profile.timezone,
        }}
        submitLabel="Save changes"
      />

      <SessionList
        sessions={activeSessions}
        currentToken={currentToken}
        timeZone={profile.timezone}
      />
    </main>
  );
}
