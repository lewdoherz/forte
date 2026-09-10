import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-session";
import { SignInForm } from "@/components/sign-in-form";

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <SignInForm />
    </main>
  );
}
