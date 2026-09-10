"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth-server";
import { db } from "./db";
import { requireSessionUserId } from "./auth-session";
import { getUserProfile, updateUserProfile, userProfileInputSchema } from "./users";
import { reportFailure } from "./log";

export type AccountActionState = { error?: string } | { ok: true };

/**
 * Signed out, so the token is unknown or already gone — a normal outcome when the
 * list is stale, not something to report as a failure.
 */
const EXPECTED_SESSION_FAILURES = ["not_found", "unauthorized", "UNAUTHORIZED"] as const;

/**
 * Revokes one of the caller's own sessions.
 *
 * Better Auth verifies the token belongs to the signed-in user before deleting
 * it, but the acting user still comes from the session helper — the token is a
 * form value and is never treated as proof of identity.
 */
export async function revokeSessionAction(formData: FormData): Promise<void> {
  await requireSessionUserId();
  const token = String(formData.get("token") ?? "");
  if (token === "") return;

  try {
    await auth.api.revokeSession({ body: { token }, headers: await headers() });
  } catch (error) {
    reportFailure("revokeSession", error, EXPECTED_SESSION_FAILURES);
  }
  revalidatePath("/account");
}

/** Signs out every device except the one making the request. */
export async function revokeOtherSessionsAction(): Promise<void> {
  await requireSessionUserId();
  try {
    await auth.api.revokeOtherSessions({ headers: await headers() });
  } catch (error) {
    reportFailure("revokeOtherSessions", error);
  }
  revalidatePath("/account");
}

export async function updateAccount(
  _prev: AccountActionState | null,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireSessionUserId();
  const parsed = userProfileInputSchema.safeParse({
    displayName: formData.get("displayName"),
    timeZone: formData.get("timeZone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    // Display name is Better Auth's `name` field (mapped to app_user.display_name
    // in lib/auth.ts), so update it through auth: that keeps the session cookie's
    // user in sync as well as the row.
    await auth.api.updateUser({
      body: { name: parsed.data.displayName },
      headers: await headers(),
    });
    // `timezone` is application-only; Better Auth does not know about it, so it
    // is written directly against the owner's row.
    await updateUserProfile(db, userId, { timeZone: parsed.data.timeZone });
  } catch {
    return { error: "Could not save your settings." };
  }

  revalidatePath("/account");
  return { ok: true };
}

/**
 * Re-sends the verification link to the signed-in user's own address.
 *
 * The address is read from the session's own row rather than from the form, so
 * this cannot be turned into a way to send mail from the app's domain to an
 * address of the caller's choosing.
 */
export async function resendVerificationAction(): Promise<void> {
  const userId = await requireSessionUserId();
  const profile = await getUserProfile(db, userId);
  if (!profile) return;

  try {
    await auth.api.sendVerificationEmail({
      body: { email: profile.email, callbackURL: "/verify-email" },
      headers: await headers(),
    });
  } catch (error) {
    reportFailure("sendVerificationEmail", error);
  }
  revalidatePath("/account");
}

/**
 * Deletes the account and everything it owns.
 *
 * Irreversible, and it destroys the training history too, so it takes a typed
 * confirmation rather than a single click. Better Auth removes the `app_user`
 * row; sessions, routines, workouts and sets follow through the cascades added
 * in 0004 and the ownership foreign keys. The redirect leaves the browser at a
 * page that still exists, since the one it was on cannot load without a session.
 */
export async function deleteAccountAction(
  _prev: AccountActionState | null,
  formData: FormData,
): Promise<AccountActionState> {
  await requireSessionUserId();

  if (String(formData.get("confirmation") ?? "").trim() !== "DELETE") {
    return { error: "Type DELETE in capitals to confirm." };
  }

  try {
    await auth.api.deleteUser({ body: { callbackURL: "/" }, headers: await headers() });
  } catch (error) {
    reportFailure("deleteUser", error);
    return { error: "Could not delete the account. Try again." };
  }

  redirect("/");
}
