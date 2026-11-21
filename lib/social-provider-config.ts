import { createHash } from "node:crypto";
import type { BetterAuthOptions } from "better-auth";
import { z } from "zod";
import { env } from "./env";
import { isPlaceholderEmail } from "./auth-email";
import { SOCIAL_PROVIDERS, type SocialProviderId } from "./social-auth";

/** Only provider-subject identity, never email matching, joins an existing user. */
export function providerIdentity(provider: SocialProviderId, profile: unknown) {
  if (!profile || typeof profile !== "object") throw new Error("Missing provider identity");
  const subject: unknown = Reflect.get(profile, "sub") ?? Reflect.get(profile, "id");
  if (typeof subject !== "string" || !subject) throw new Error("Missing provider subject");
  const rawEmail: unknown = Reflect.get(profile, "email");
  const parsed = z.email().safeParse(typeof rawEmail === "string" ? rawEmail.trim() : rawEmail);
  const contact = parsed.success && !isPlaceholderEmail(parsed.data) ? parsed.data : null;
  const claim: unknown = Reflect.get(profile, "email_verified");
  const digest = createHash("sha256").update(`${provider}\0${subject}`).digest("hex");
  return {
    email: contact ?? `${provider}-${digest}@social.placeholder.invalid`,
    emailVerified: contact !== null && (claim === true || (provider === "apple" && claim === "true")),
  };
}

// Readiness is a deliberate operator gate, separate from merely possessing keys.
// Leave false until live authorization, cancellation, linking and native return
// have been verified. Partial staged credentials cannot expose a public button.
export const socialProviderOptions: NonNullable<BetterAuthOptions["socialProviders"]> = {
  ...(env.GOOGLE_VERIFIED && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
      disableDefaultScope: true, scope: ["openid", "email"], accessType: "online" as const,
      prompt: "select_account" as const, includeGrantedScopes: false,
      mapProfileToUser: (profile: unknown) => providerIdentity("google", profile) },
  } : {}),
  ...(env.APPLE_VERIFIED && env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET ? {
    apple: { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET,
      disableDefaultScope: true, scope: ["email"],
      mapProfileToUser: (profile: unknown) => providerIdentity("apple", profile) },
  } : {}),
  ...(env.FACEBOOK_VERIFIED && env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET ? {
    facebook: { clientId: env.FACEBOOK_CLIENT_ID, clientSecret: env.FACEBOOK_CLIENT_SECRET,
      disableDefaultScope: true, scope: ["public_profile", "email"],
      mapProfileToUser: (profile: unknown) => providerIdentity("facebook", profile) },
  } : {}),
  ...(env.LINKEDIN_VERIFIED && env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET ? {
    linkedin: { clientId: env.LINKEDIN_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET,
      disableDefaultScope: true, scope: ["openid", "email"],
      mapProfileToUser: (profile: unknown) => providerIdentity("linkedin", profile) },
  } : {}),
};
export const enabledSocialProviders = SOCIAL_PROVIDERS.filter((id) => Boolean(socialProviderOptions[id]));
