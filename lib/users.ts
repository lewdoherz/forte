import { z } from "zod";
import type { Kysely } from "kysely";
import type { Database } from "./db";
import { isValidTimeZone } from "./timezone";
import { DEFAULT_LOCALE, createTranslator, getMessages, type Translate } from "./i18n";

/**
 * Account-settings input. The display name is trimmed to 1..80 characters; the
 * timezone must both be non-empty and resolve as a real IANA name (the database
 * only enforces a shape constraint, not validity).
 *
 * The issues are rendered by the settings form, so the messages come from the
 * translator: a Chinese reader must not be answered by an English validation
 * error.
 */
export function userProfileInputSchemaFor(t: Translate) {
  return z.object({
    displayName: z
      .string()
      .trim()
      .min(1, t("account.validation.displayNameRequired"))
      .max(80, t("account.validation.displayNameTooLong")),
    timeZone: z
      .string()
      .trim()
      .min(1, t("account.validation.timeZoneRequired"))
      .refine(isValidTimeZone, t("account.validation.timeZoneInvalid")),
  });
}

/**
 * The English-message instance, for callers that have no request locale — the
 * verification suites drive this module directly, outside any request scope.
 */
export const userProfileInputSchema = userProfileInputSchemaFor(
  createTranslator(DEFAULT_LOCALE, getMessages(DEFAULT_LOCALE)),
);

export type UserProfileInput = z.infer<typeof userProfileInputSchema>;

/** The owner's own account fields. Never expose another user's row. */
export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string;
  /**
   * The account's interface language (`'en'` | `'zh-CN'`). Read here so mail
   * sent from a background task, and any render without a request context,
   * still has a language to use.
   */
  locale: string;
  /** False until the address is confirmed; never blocks sign-in (see lib/auth.ts). */
  email_verified: boolean;
}

/**
 * The signed-in user's account row. `userId` must come from the session
 * (requireSessionUserId) — there is deliberately no lookup by email/username.
 */
export async function getUserProfile(
  db: Kysely<Database>,
  userId: string,
): Promise<UserProfile | undefined> {
  return db
    .selectFrom("app_user")
    .select(["id", "email", "display_name", "timezone", "locale", "email_verified"])
    .where("id", "=", userId)
    .executeTakeFirst();
}

/**
 * Writes the user's application-only settings. The display name is deliberately
 * NOT written here: it is Better Auth's `name` field and is updated through
 * `auth.api.updateUser` so the session stays consistent. Scoped to `userId`, so
 * a caller can never reach another account's row.
 */
export async function updateUserProfile(
  db: Kysely<Database>,
  userId: string,
  input: Pick<UserProfileInput, "timeZone">,
): Promise<void> {
  await db
    .updateTable("app_user")
    .set({ timezone: input.timeZone })
    .where("id", "=", userId)
    .execute();
}

/**
 * Records the account's interface language.
 *
 * Separate from `updateUserProfile` because it is written from the language
 * picker rather than the account form, and because it deliberately does not go
 * through Better Auth: the value only ever drives rendering and outgoing mail.
 * Scoped to `userId` like every other write here.
 */
export async function updateUserLocale(
  db: Kysely<Database>,
  userId: string,
  locale: string,
): Promise<void> {
  await db
    .updateTable("app_user")
    .set({ locale })
    .where("id", "=", userId)
    .execute();
}
