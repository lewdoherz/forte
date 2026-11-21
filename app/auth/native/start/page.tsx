import { notFound } from "next/navigation";
import { z } from "zod";
import { enabledSocialProviders } from "@/lib/auth-server";
import { SOCIAL_PROVIDERS } from "@/lib/social-auth";
import { getI18n } from "@/lib/i18n/server";
import { SocialSignIn } from "@/components/social-sign-in";
import { LanguageSwitcher } from "@/components/language-switcher";

const input = z.object({
  provider: z.enum(SOCIAL_PROVIDERS), platform: z.enum(["android", "ios"]),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export default async function NativeStartPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = input.safeParse(await searchParams);
  if (!parsed.success || !enabledSocialProviders.includes(parsed.data.provider)) notFound();
  const { provider, ...proof } = parsed.data;
  const { t } = await getI18n();
  const query = new URLSearchParams(proof);
  const cancel = `/api/auth/native/cancel?${new URLSearchParams({ state: proof.state })}`;
  return <main className="flex min-h-dvh items-center justify-center px-4 py-10">
    <div className="fixed right-4 top-4"><LanguageSwitcher compact /></div>
    <section className="w-full max-w-sm space-y-5 rounded-xl border border-zinc-300 p-6">
      <h1 className="text-2xl font-semibold">{t("common.signIn")}</h1>
      <p className="text-sm text-zinc-600">{t("auth.native.body")}</p>
      <SocialSignIn providers={[provider]} callbackURL={`/api/auth/native/authorize?${query}`} errorCallbackURL={cancel} />
      <a className="flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4" href={cancel}>{t("common.cancel")}</a>
    </section>
  </main>;
}
