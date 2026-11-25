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
  "account.form.noEmailProvided": "No email provided",
  "account.providerFallbackName": "Linked account",
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
  "account.email.noContactBody":
    "No contact email was provided by your sign-in method. An identity address is not a contact email and cannot receive password reset messages.",

  "account.methods.title": "Sign-in methods",
  "account.methods.description": "These methods access this same account and its workout data.",
  "account.methods.emailPassword": "Email and password",
  "account.methods.otherProvider": "Linked sign-in provider",
  "account.methods.connected": "Connected",
  "account.methods.resetPassword": "Reset password by email",
  "account.methods.setPassword": "Set a password by email",
  "account.methods.passwordNeedsEmail": "Password recovery or setup requires a real, verified contact email. A provider identity address is not a recovery address.",
  "account.methods.linkDescription": "Connect another provider while signed in to this account. You must authenticate with that provider; matching email addresses alone never link accounts.",
  "account.methods.link": "Connect {provider}",
  "account.methods.linking": "Opening {provider}…",
  "account.methods.linkFailed": "Linking was cancelled or could not be completed. Your existing sign-in methods have not been removed. Try again.",
  "account.methods.nativeInstructions": "Open your account in the system browser and sign in to the same Forte account before connecting a provider. Your app session is not shared with the browser. Then return to the app and refresh this list, or sign in with your newly linked method.",
  "account.methods.manageInBrowser": "Manage sign-in methods in browser",
  "account.methods.refresh": "Refresh methods",
  "account.methods.addEmailDescription": "Add a contact email to this same account for password recovery. Your email changes only after you confirm the new address; your linked sign-in methods stay connected.",
  "account.methods.contactEmail": "Contact email",
  "account.methods.sendEmailVerification": "Send verification",
  "account.methods.emailSending": "Sending…",
  "account.methods.emailSent": "If this address can be used, a verification link is on its way. Confirm the new address, then refresh this page to set a password by email for this same account.",
  "account.methods.emailError": "Could not send the verification request. Try again. Your existing sign-in methods have not changed.",
  "account.methods.emailReauth": "Your sign-in needs to be renewed. Sign out, then sign in again with an existing method before retrying this request.",
  "account.methods.refreshEmail": "Refresh after verifying email",

  "account.sessions.title": "Where you are signed in",
  "account.sessions.description":
    "Devices that can currently reach your account. Signing one out takes effect immediately.",
  "account.sessions.unknownDevice": "Unknown device",
  "account.sessions.unknownAddress": "unknown address",
  "account.sessions.thisDevice": "This device",
  "account.sessions.meta": "{address} · started {started} · expires {expires}",
  "account.sessions.signOutOthers": "Sign out everywhere else",
  "account.sessions.freshRequired":
    "For your security, sign in again to view or sign out other devices. Your current session on this device remains active.",
  "account.sessions.unavailable":
    "Could not load the full device list right now. Try again when connected.",
  "account.methods.unavailable":
    "Could not load linked sign-in methods right now. Try again when connected.",

  "account.preferences.title": "Device preferences",
  "account.preferences.description":
    "Stored on this device and available offline.",
  "account.appearance.title": "Appearance",
  "account.appearance.description": "Choose how forte looks on this device.",
  "account.appearance.system": "System",
  "account.appearance.light": "Light",
  "account.appearance.dark": "Dark",

  "account.rest.title": "Rest timer",
  "account.rest.description":
    "Default rest duration and completion alerts for active workouts. Stored on this device and available offline.",
  "account.rest.defaultDuration": "Default rest duration",
  "account.rest.sound": "Completion sound",
  "account.rest.soundHint": "Play a chime when the rest timer reaches zero.",
  "account.rest.vibration": "Completion vibration",
  "account.rest.vibrationHint": "Vibrate when the rest timer finishes, where supported.",
  "account.rest.preview": "Preview alert",
  "account.rest.previewed": "Alert preview triggered.",
  "account.rest.previewMuted": "Enable sound or vibration to preview an alert.",

  "account.offline.banner":
    "You are offline. Appearance and rest-timer preferences work below; account actions need an internet connection.",
  "account.offline.requiresConnection": "Requires an internet connection.",

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
