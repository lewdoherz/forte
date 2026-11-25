import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth, enabledSocialProviders } from "@/lib/auth-server";
import { requireSession, requireSessionUserId } from "@/lib/auth-session";
import { isPlaceholderEmail } from "@/lib/auth-email";
import { getUserProfile } from "@/lib/users";
import { getI18n } from "@/lib/i18n/server";
import { reportFailure } from "@/lib/log";
import {
  deleteAccountAction,
  resendVerificationAction,
  updateAccount,
} from "@/lib/account-actions";
import { AccountForm } from "@/components/account-form";
import { AccountSignInMethods } from "@/components/account-sign-in-methods";
import { AccountOnlineGuard } from "@/components/account-online-guard";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { DevicePreferences } from "@/components/device-preferences";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { SessionList, type ActiveSession } from "@/components/session-list";

function isSessionNotFreshError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { statusCode?: unknown; status?: unknown; body?: { code?: unknown }; message?: unknown };
  if (record.body?.code === "SESSION_NOT_FRESH") return true;
  if (typeof record.message === "string" && record.message.toLowerCase().includes("not fresh")) return true;
  return record.statusCode === 403 && record.status === "FORBIDDEN";
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ social?: string | string[] }>;
}) {
  const userId = await requireSessionUserId();
  const profile = await getUserProfile(db, userId);

  // A session without a row should not exist (session.user.id === app_user.id);
  // recover through sign-in rather than render a form with nothing to write to.
  if (!profile) {
    redirect("/sign-in");
  }

  const { t } = await getI18n();
  const hasContactEmail = !isPlaceholderEmail(profile.email);

  // The current session is identified by its token so the list can mark it and
  // refuse to offer a "sign out" that would immediately sign the user back out of
  // the page they are looking at.
  const session = await requireSession();
  const currentToken = session.session.token;
  const requestHeaders = await headers();

  // Better Auth's `listSessions` requires a fresh session (default <= 24h old).
  // Sessions stay valid for 7 days, so an aged session must degrade gracefully
  // inside the Sessions section instead of crashing the entire Settings page.
  type SessionsLoad =
    | { status: "ok"; sessions: ActiveSession[] }
    | { status: "stale"; sessions: ActiveSession[] }
    | { status: "error"; sessions: ActiveSession[] };

  const currentFallbackSession: ActiveSession = {
    id: session.session.id,
    token: currentToken,
    ipAddress: session.session.ipAddress ?? null,
    userAgent: session.session.userAgent ?? null,
    createdAt: new Date(session.session.createdAt),
    expiresAt: new Date(session.session.expiresAt),
  };

  const [sessionsResult, accountsResult, query] = await Promise.all([
    auth.api
      .listSessions({ headers: requestHeaders })
      .then((list): SessionsLoad => ({
        status: "ok",
        sessions: list.map((entry) => ({
          id: entry.id,
          token: "token" in entry && typeof entry.token === "string" ? entry.token : null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
          createdAt: new Date(entry.createdAt),
          expiresAt: new Date(entry.expiresAt),
        })),
      }))
      .catch((error): SessionsLoad => {
        if (isSessionNotFreshError(error)) {
          return { status: "stale", sessions: [currentFallbackSession] };
        }
        reportFailure("account.listSessions", error);
        return { status: "error", sessions: [currentFallbackSession] };
      }),
    auth.api
      .listUserAccounts({ headers: requestHeaders })
      .then((list) => ({ status: "ok" as const, providerIds: list.map((a) => a.providerId) }))
      .catch((error) => {
        reportFailure("account.listUserAccounts", error);
        return { status: "error" as const, providerIds: [] as string[] };
      }),
    searchParams,
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <Link href="/" className="text-sm text-[var(--text-muted)] underline">
        ← {t("nav.home")}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">{t("nav.account")}</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{t("account.subtitle")}</p>

      {/* Local device preferences: Appearance & Rest timer work offline too. */}
      <DevicePreferences userId={userId} />

      <AccountOnlineGuard>
        <AccountForm
          action={updateAccount}
          initial={{
            email: hasContactEmail ? profile.email : null,
            displayName: profile.display_name ?? "",
            timeZone: profile.timezone,
          }}
        />

        <AccountSignInMethods
          linkedProviderIds={accountsResult.providerIds}
          unavailable={accountsResult.status === "error"}
          providers={enabledSocialProviders}
          canRecoverPassword={hasContactEmail && Boolean(profile.email_verified)}
          missingContactEmail={!hasContactEmail}
          native={/ForteAndroid\/1|ForteIOS\/1/.test(requestHeaders.get("user-agent") ?? "")}
          socialError={query.social === "error"}
        />

        {/* The header only carries the compact picker, so the full control — label,
            options and description — belongs here, where a signed-in reader looks
            for their account settings. */}
        <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
          <h2 className="text-lg font-semibold">{t("common.language.title")}</h2>
          <div className="mt-4">
            <LanguageSwitcher />
          </div>
        </section>

        <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
          <h2 className="text-lg font-semibold">{t("account.email.title")}</h2>
          {!hasContactEmail ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">{t("account.email.noContactBody")}</p>
          ) : profile.email_verified ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              <span className="font-medium text-[var(--accent-text)]">
                {t("account.email.verifiedBadge")}
              </span>{" "}
              {t("account.email.verifiedBody", { email: profile.email })}
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                <span className="font-medium text-[var(--warning-text)]">
                  {t("account.email.notVerifiedBadge")}
                </span>{" "}
                {t("account.email.notVerifiedBody", { email: profile.email })}
              </p>
              <form action={resendVerificationAction} className="mt-3">
                <button
                  type="submit"
                  className="h-11 rounded-md border border-[var(--border-subtle)] px-4 text-sm font-medium hover:bg-[var(--bg-surface-hover)]"
                >
                  {t("account.email.resend")}
                </button>
              </form>
            </>
          )}
        </section>

        <SessionList
          sessions={sessionsResult.sessions}
          currentToken={currentToken}
          timeZone={profile.timezone}
          freshSessionRequired={sessionsResult.status === "stale"}
          unavailable={sessionsResult.status === "error"}
        />

        <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
          <h2 className="text-lg font-semibold">{t("account.data.title")}</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{t("account.data.description")}</p>
          <a
            href="/account/export"
            className="mt-3 inline-flex h-11 items-center rounded-md border border-[var(--border-subtle)] px-4 text-sm font-medium hover:bg-[var(--bg-surface-hover)]"
          >
            {t("account.data.download")}
          </a>
        </section>

        <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
          <h2 className="text-lg font-semibold text-[var(--danger-text)]">{t("account.danger.title")}</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{t("account.danger.description")}</p>
          <DeleteAccountForm action={deleteAccountAction} />
        </section>

        <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
          <h2 className="text-lg font-semibold">{t("common.signOut")}</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{t("account.signOut.description")}</p>
          <div className="mt-4">
            <SignOutButton />
          </div>
        </section>
      </AccountOnlineGuard>
    </main>
  );
}
