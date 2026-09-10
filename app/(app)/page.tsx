import { requireSession } from "@/lib/auth-session";
import { db } from "@/lib/db";

export default async function DashboardPage() {
  const session = await requireSession();
  const user = await db
    .selectFrom("app_user")
    .select(["email", "username"])
    .where("id", "=", session.user.id)
    .executeTakeFirst();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium">You&apos;re signed in</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Email</dt>
            <dd>{user?.email ?? session.user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Canonical user id (app_user.id)</dt>
            <dd className="break-all text-right font-mono text-xs">{session.user.id}</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
