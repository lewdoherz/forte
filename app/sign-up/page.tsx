import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-session";
import { SignUpForm } from "@/components/sign-up-form";

export default async function SignUpPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <SignUpForm />
    </main>
  );
}
