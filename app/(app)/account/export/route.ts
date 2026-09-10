import { requireSessionUserId } from "@/lib/auth-session";
import { gatherAccountExport } from "@/lib/account-export";
import { db } from "@/lib/db";

// Session-scoped and never cached: the response is one user's data.
export const dynamic = "force-dynamic";

/**
 * The account's training history as a JSON download.
 *
 * The user id comes from the session helper and from nowhere else. A route
 * handler does not render a layout, so the protected shell's check does not run
 * here — this is the only gate, and it cannot be influenced by the request.
 */
export async function GET() {
  const userId = await requireSessionUserId();
  const payload = await gatherAccountExport(db, userId);

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="forte-export-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
