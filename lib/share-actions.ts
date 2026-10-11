"use server";

import { z } from "zod";
import { db } from "./db";
import { reportFailure } from "./log";
import { requireSessionUserId } from "./auth-session";
import { getI18n } from "./i18n/server";
import { getOrCreateRoutineShareToken, revokeRoutineShareLinks } from "./share";

export type RoutineShareLinkState = { token: string } | { error: string };
export type RoutineShareActionState = { error?: string };

/**
 * Returns the public link token for a routine, creating the share row on first
 * request. The session is required and the routine must belong to the caller —
 * `getOrCreateRoutineShareToken` enforces the ownership, and only the token is
 * returned so the URL is assembled in the browser from the current origin.
 */
export async function createRoutineShareLink(
  routineId: string,
): Promise<RoutineShareLinkState> {
  const userId = await requireSessionUserId();
  const { t } = await getI18n();
  const parsed = z.string().uuid().safeParse(routineId);
  if (!parsed.success) return { error: t("routines.error.invalidRoutine") };

  try {
    const token = await getOrCreateRoutineShareToken(db, userId, parsed.data);
    if (!token) return { error: t("routines.error.notFound") };
    return { token };
  } catch (error) {
    reportFailure("createRoutineShareLink", error);
    return { error: t("routines.share.createFailed") };
  }
}

/**
 * Revokes every active link for the caller's routine. The public URL stops
 * resolving immediately; a later copy mints a new token.
 */
export async function revokeRoutineShareLink(
  routineId: string,
): Promise<RoutineShareActionState> {
  const userId = await requireSessionUserId();
  const { t } = await getI18n();
  const parsed = z.string().uuid().safeParse(routineId);
  if (!parsed.success) return { error: t("routines.error.invalidRoutine") };

  try {
    await revokeRoutineShareLinks(db, userId, parsed.data);
    return {};
  } catch (error) {
    reportFailure("revokeRoutineShareLink", error);
    return { error: t("routines.share.revokeFailed") };
  }
}
