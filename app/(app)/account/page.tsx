import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth-server";
import { requireSession, requireSessionUserId } from "@/lib/auth-session";
import { getUserProfile } from "@/lib/users";
import { getI18n } from "@/lib/i18n/server";
import {
  deleteAccountAction,
  resendVerificationAction,
  updateAccount,
} from "@/lib/account-actions";
import { AccountForm } from "@/components/account-form";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { SessionList, type ActiveSession } from "@/components/session-list";

export default async function AccountPage() {
  const userId = await requireSessionUserId();
  const profile = await getUserProfile(db, userId);

  // A session without a row should not exist (session.user.id === app_user.id);
  // recover through sign-in rather than render a form with nothing to write to.
  if (!profile) {
    redirect("/sign-in");
  }

  const { t } = await getI18n();

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
        ← {t("nav.home")}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">{t("nav.account")}</h1>
      <p className="mt-1 text-sm text-zinc-500">{t("account.subtitle")}</p>

      <AccountForm
        action={updateAccount}
        initial={{
          email: profile.email,
          displayName: profile.display_name ?? "",
          timeZone: profile.timezone,
        }}
      />

      {/* The header only carries the compact picker, so the full control — label,
          options and description — belongs here, where a signed-in reader looks
          for their account settings. */}
      <section className="mt-10 border-t border-zinc-200 pt-6">
        <h2 className="text-lg font-semibold">{t("common.language.title")}</h2>
        <div className="mt-4">
          <LanguageSwitcher />
        </div>
      </section>

      <section className="mt-10 border-t border-zinc-200 pt-6">
        <h2 className="text-lg font-semibold">{t("account.email.title")}</h2>
        {profile.email_verified ? (
          <p className="mt-2 text-sm text-zinc-600">
            <span className="font-medium text-green-700">
              {t("account.email.verifiedBadge")}
            </span>{" "}
            {t("account.email.verifiedBody", { email: profile.email })}
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-zinc-600">
              <span className="font-medium text-amber-700">
                {t("account.email.notVerifiedBadge")}
              </span>{" "}
              {t("account.email.notVerifiedBody", { email: profile.email })}
            </p>
            <form action={resendVerificationAction} className="mt-3">
              <button
                type="submit"
                className="h-11 rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100"
              >
                {t("account.email.resend")}
              </button>
            </form>
          </>
        )}
      </section>

      <SessionList
        sessions={activeSessions}
        currentToken={currentToken}
        timeZone={profile.timezone}
      />

      <section className="mt-10 border-t border-zinc-200 pt-6">
        <h2 className="text-lg font-semibold">{t("account.data.title")}</h2>
        <p className="mt-2 text-sm text-zinc-600">{t("account.data.description")}</p>
        <a
          href="/account/export"
          className="mt-3 inline-flex h-11 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100"
        >
          {t("account.data.download")}
        </a>
      </section>

      <section className="mt-10 border-t border-zinc-200 pt-6">
        <h2 className="text-lg font-semibold text-red-700">{t("account.danger.title")}</h2>
        <p className="mt-2 text-sm text-zinc-600">{t("account.danger.description")}</p>
        <DeleteAccountForm action={deleteAccountAction} />
      </section>

      <section className="mt-10 border-t border-zinc-200 pt-6">
        <h2 className="text-lg font-semibold">{t("common.signOut")}</h2>
        <p className="mt-2 text-sm text-zinc-600">{t("account.signOut.description")}</p>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
