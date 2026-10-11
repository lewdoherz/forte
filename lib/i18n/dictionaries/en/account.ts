/**
 * Messages for the "account" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 *
 * The typed deletion token stays the literal "DELETE" in every language: it is
 * the value the action compares against, not copy.
 */
export const account = {
  "account.subtitle":
    "Your display name is shown across the app; your timezone controls how dates and progress are bucketed.",

  "account.form.email": "Email",
  "account.form.displayName": "Display name",
  "account.form.timeZone": "Timezone",
  "account.form.timeZonePlaceholder": "America/Chicago",
  "account.form.timeZoneHelp":
    "IANA timezone name (e.g. America/Chicago), used for date and progress bucketing.",

  "account.email.title": "Email",
  "account.email.verifiedBadge": "Verified.",
  "account.email.verifiedBody": "{email} is confirmed.",
  "account.email.notVerifiedBadge": "Not verified.",
  "account.email.notVerifiedBody":
    "{email} has not been confirmed yet. The account works without it — nothing is blocked — but confirming the address proves we can reach you. An address mistyped at sign-up is one that a password reset would never arrive at.",
  "account.email.resend": "Send verification email",

  "account.sessions.title": "Where you are signed in",
  "account.sessions.description":
    "Devices that can currently reach your account. Signing one out takes effect immediately.",
  "account.sessions.unknownDevice": "Unknown device",
  "account.sessions.unknownAddress": "unknown address",
  "account.sessions.thisDevice": "This device",
  "account.sessions.meta": "{address} · started {started} · expires {expires}",
  "account.sessions.signOutOthers": "Sign out everywhere else",

  "account.data.title": "Your data",
  "account.data.description":
    "Download everything recorded here — routines, workouts, sets and any custom exercises — as a JSON file.",
  "account.data.download": "Download your data",

  "account.danger.title": "Delete account",
  "account.danger.description":
    "Removes the account and everything in it — routines, workouts and history. This cannot be undone, so download your data first if you want to keep it.",
  "account.danger.confirmLabel": "Type DELETE to confirm",
  "account.danger.confirmSubmit": "Delete account",
  "account.danger.offlineError":
    "Could not clear offline workout data. Account deletion was stopped.",

  "account.signOut.description":
    "Ends this session on this device and returns you to the sign-in page.",

  "account.errors.invalidInput": "Invalid input.",
  "account.errors.saveFailed": "Could not save your settings.",
  "account.errors.confirmation": "Type DELETE in capitals to confirm.",
  "account.errors.deleteFailed": "Could not delete the account. Try again.",

  "account.validation.displayNameRequired": "Display name is required",
  "account.validation.displayNameTooLong": "Display name is too long",
  "account.validation.timeZoneRequired": "Timezone is required",
  "account.validation.timeZoneInvalid":
    "Enter a valid IANA timezone, e.g. America/Chicago",
} as const;
