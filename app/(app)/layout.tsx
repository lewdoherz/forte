import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth-session";
import { isPlaceholderEmail } from "@/lib/auth-email";
import { db } from "@/lib/db";
import { getActiveWorkout } from "@/lib/workouts";
import { getI18n } from "@/lib/i18n/server";
import { AppFrame } from "@/components/app-frame";

/**
 * Protected application boundary. Every page under app/(app)/ requires an
 * authenticated session; otherwise this layout redirects to /sign-in.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const activeWorkout = await getActiveWorkout(db, session.user.id);
  const { t } = await getI18n();
  // Better Auth maps `name` to the nullable app_user.display_name column.
  // Reserved identity addresses must never be shown as contact information.
  const displayName =
    (session.user.name ?? "").trim() ||
    (isPlaceholderEmail(session.user.email)
      ? t("account.providerFallbackName")
      : session.user.email);

  return (
    <AppFrame
      userId={session.user.id}
      displayName={displayName}
      activeWorkout={activeWorkout ? {
        id: activeWorkout.id,
        title: activeWorkout.title,
        startedAt: activeWorkout.started_at.toISOString(),
      } : null}
    >
      {children}
    </AppFrame>
  );
}
