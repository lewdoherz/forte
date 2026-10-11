import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-session";
import { SignInForm } from "@/components/sign-in-form";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <>
      <div className="fixed right-4 top-4">
        {/* Someone who cannot read the current language must be able to switch
            before signing in. */}
        <LanguageSwitcher compact />
      </div>
      <main className="flex min-h-screen items-center justify-center px-4">
        <SignInForm />
      </main>
    </>
  );
}
