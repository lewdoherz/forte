import { z } from "zod";
import type { Kysely } from "kysely";
import type { Database } from "./db";
import { isValidTimeZone } from "./timezone";

/**
 * Account-settings input. The display name is trimmed to 1..80 characters; the
 * timezone must both be non-empty and resolve as a real IANA name (the database
 * only enforces a shape constraint, not validity).
 */
export const userProfileInputSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(80, "Display name is too long"),
  timeZone: z
    .string()
    .trim()
    .min(1, "Timezone is required")
    .refine(isValidTimeZone, "Enter a valid IANA timezone, e.g. America/Chicago"),
});

export type UserProfileInput = z.infer<typeof userProfileInputSchema>;

/** The owner's own account fields. Never expose another user's row. */
export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string;
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
    .select(["id", "email", "display_name", "timezone", "email_verified"])
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
