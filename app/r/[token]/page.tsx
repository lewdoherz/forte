import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { resolveRoutineShare } from "@/lib/share";
import { getVocabularies } from "@/lib/exercises";
import { SharedRoutineView } from "@/components/shared-routine-view";

/**
 * A shared routine, readable by anyone holding the token — no session, no
 * account. It lives at the app root rather than under `(app)` precisely because
 * that boundary calls `requireSession` and would redirect a signed-out visitor
 * to sign-in before the token could be read.
 *
 * Read-only by construction: the page renders and never mutates. It has no
 * server action, no form, and `resolveRoutineShare` only reads, so there is no
 * code path from this route that writes anything. The token IS the
 * authorization, and it resolves to exactly one routine.
 *
 * Never cached: a link must stop working the moment it is revoked (or when it
 * expires), so every request re-reads the token's current state.
 */
export const dynamic = "force-dynamic";

// The URL is a capability, not a published page: keep it out of search indexes
// so a shared link cannot surface to someone who was never given it.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SharedRoutinePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const routine = await resolveRoutineShare(db, token);
  // An invalid, revoked or expired token is a plain 404: the route reveals
  // nothing about whether a routine exists behind a token that does not work.
  if (!routine) notFound();

  const { muscles } = await getVocabularies(db);

  return <SharedRoutineView routine={routine} muscles={muscles} />;
}
