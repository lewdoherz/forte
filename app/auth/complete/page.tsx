import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-session";
import { AuthCompletion } from "@/components/auth-completion";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function AuthCompletePage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?social=error");

  return (
    <>
      <div className="fixed right-4 top-4">
        <LanguageSwitcher compact />
      </div>
      <main className="flex min-h-screen items-center justify-center px-4">
        <AuthCompletion userId={session.user.id} />
      </main>
    </>
  );
}
