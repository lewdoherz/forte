import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth-server";

/**
 * Server-side session lookup, deduplicated per request with React `cache`.
 * Never trust a user id from the browser: every ownership decision must start
 * here.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Returns the authenticated session, or redirects to /sign-in. Used by the
 * protected `(app)` boundary and by any server code that needs a session.
 */
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  return session;
}

/**
 * Canonical application user id: session.user.id === app_user.id. This is the
 * only way ownership-sensitive code may obtain a user id. There is deliberately
 * no helper that accepts a caller-supplied user id.
 */
export async function requireSessionUserId(): Promise<string> {
  const session = await requireSession();
  return session.user.id;
}
