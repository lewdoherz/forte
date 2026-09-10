import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionUserId } from "@/lib/auth-session";
import { getUserProfile } from "@/lib/users";
import { updateAccount } from "@/lib/account-actions";
import { AccountForm } from "@/components/account-form";

export default async function AccountPage() {
  const userId = await requireSessionUserId();
  const profile = await getUserProfile(db, userId);

  // A session without a row should not exist (session.user.id === app_user.id);
  // recover through sign-in rather than render a form with nothing to write to.
  if (!profile) {
    redirect("/sign-in");
  }

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
    </main>
  );
}
