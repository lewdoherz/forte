export const SOCIAL_PROVIDERS = ["google", "apple", "facebook", "linkedin"] as const;
export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number];
export const providerNames: Record<SocialProviderId, string> = {
  google: "Google", apple: "Apple", facebook: "Facebook", linkedin: "LinkedIn",
};
export function isSocialProvider(value: unknown): value is SocialProviderId {
  return typeof value === "string" && SOCIAL_PROVIDERS.some((provider) => provider === value);
}

/** Legacy WebViews must not fall through to embedded Google authorization. */
export function isEmbeddedAuthUserAgent(userAgent: string): boolean {
  return /Forte(Android|IOS)\/1|\bwv\b/i.test(userAgent) ||
    (/iPhone|iPad|iPod/.test(userAgent) && /AppleWebKit/.test(userAgent) && !/Safari\//.test(userAgent));
}
