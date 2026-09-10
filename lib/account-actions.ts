"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "./auth-server";
import { db } from "./db";
import { requireSessionUserId } from "./auth-session";
import { updateUserProfile, userProfileInputSchema } from "./users";

export type AccountActionState = { error?: string } | { ok: true };

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
    await updateUserProfile(db, userId, parsed.data);
  } catch {
    return { error: "Could not save your settings." };
  }

  revalidatePath("/account");
  return { ok: true };
}
