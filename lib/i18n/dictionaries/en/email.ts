/**
 * Messages for the "email" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 *
 * This area covers the transactional mail in `lib/email-templates.ts`. The
 * plain-text and HTML variants of the same mail are separate keys wherever the
 * two punctuate a lead line differently — the text body ends it with a colon
 * because the link follows on its own line, the HTML body closes the sentence.
 */
export const email = {
  /* Greeting. The display name is interpolated when the account has one. */
  "email.greeting": "Hi,",
  "email.greetingWithName": "Hi {name},",

  /* Verification mail. */
  "email.verification.subject": "Verify your forte email",
  "email.verification.heading": "Verify your email",
  "email.verification.intro": "Confirm this email address to finish setting up your forte account.",
  "email.verification.textIntro": "Confirm this email address to finish setting up your forte account:",
  "email.verification.action": "Verify email",
  "email.verification.note": "The link expires, but verifying is optional: your account works without it.",

  /* Password-reset mail. The text lead is wrapped so the plain-text body stays
     inside the 78 columns a mail client expects. */
  "email.reset.subject": "Reset your forte password",
  "email.reset.heading": "Reset your password",
  "email.reset.intro": "Someone asked to reset the password for your forte account. Choose a new password with the button below.",
  "email.reset.textIntro": "Someone asked to reset the password for your forte account. Choose a new\npassword here:",
  "email.reset.action": "Reset password",
  "email.reset.note": "If this was not you, ignore this email and your password will stay unchanged.",

  /* Shared shell copy: the hint above the copyable link, and the footer line.
     The product name itself is never translated. */
  "email.copyFallback": "If the button does not work, copy this link into your browser:",
  "email.footer": "forte — workout tracking",
} as const;
