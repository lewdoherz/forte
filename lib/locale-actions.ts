"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getSession } from "./auth-session";
import { db } from "./db";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
  type Locale,
} from "./i18n/config";
import { updateUserLocale } from "./users";

/**
 * Changing the interface language.
 *
 * Two writes, and both are needed:
 *
 * - the cookie, so the very next render is localized. It is readable on the
 *   signed-out pages too, which is what lets someone who cannot read English
 *   switch language before they can sign in.
 * - `app_user.locale`, when someone is signed in, so transactional email follows
 *   the account rather than whichever browser happened to request it, and so the
 *   choice travels to a device that has never seen the cookie.
 *
 * A signed-out visitor only gets the cookie: there is no account to attach the
 * preference to, and inventing one is not this action's business.
 */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const value = formData.get("locale");
  if (!isLocale(value)) return;

  const locale: Locale = value;

  const store = await cookies();
  store.set({
    name: LOCALE_COOKIE,
    value: locale,
    // Not `httpOnly`: the offline fallback page served by the service worker
    // reads it after a network failure, and that page has no server render to
    // consult. It carries no secret, only a language tag.
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });

  const session = await getSession();
  if (session) {
    await updateUserLocale(db, session.user.id, locale);
  }

  // The shell renders strings on every route, so the whole tree re-renders
  // rather than one segment. `revalidatePath` without this would leave the
  // already-rendered layout in the old language.
  revalidatePath("/", "layout");
}
