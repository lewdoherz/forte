/**
 * Messages for the "auth" area.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 */
export const auth = {
  /* Field labels shared by the credential forms. */
  "auth.field.email": "Email",
  "auth.field.password": "Password",
  "auth.field.newPassword": "New password",
  "auth.field.confirmPassword": "Confirm password",

  /* The real rule, mirrored by `minLength={8}` on the password inputs. */
  "auth.password.rule": "At least 8 characters.",

  /* Better Auth answers with an English `message` and a stable `code`. The
     forms map the codes they can expect onto these lines, so a server error
     is never rendered in English; an unknown code falls back to the form's
     generic line. */
  "auth.error.emailRequired": "Email is required.",
  "auth.error.invalidCredentials": "Invalid email or password.",
  "auth.error.invalidEmail": "Enter a valid email address.",
  "auth.error.emailNotVerified": "This email address has not been verified yet.",
  "auth.error.userExists": "An account already exists for that email.",
  "auth.error.passwordTooShort": "Password must be at least 8 characters.",
  "auth.error.passwordMismatch": "Passwords do not match.",
  "auth.error.invalidToken": "This link is not valid.",
  "auth.error.tokenExpired": "This link has expired.",
  "auth.error.signUpFailed": "Could not create your account.",
  "auth.error.resetLinkFailed": "Could not send the reset link. Try again.",
  "auth.error.resetFailed": "Could not reset your password. Request a new link.",
  "auth.error.offlinePreparationFailed":
    "Could not securely prepare offline workout data. Try again.",
  "auth.error.offlineAfterSignUp":
    "Your account was created, but offline workout data could not be prepared. Sign in again.",
  "auth.error.offlineClearFailed":
    "Could not clear offline workout data. Sign-out was stopped.",

  "auth.signIn.missingFields": "Email and password are required.",
  "auth.signIn.submitting": "Signing in…",
  "auth.signIn.noAccount": "No account?",

  "auth.signUp.title": "Create your account",
  "auth.signUp.submitting": "Creating account…",
  "auth.signUp.haveAccount": "Already have an account?",

  "auth.forgotPassword.title": "Reset your password",
  "auth.forgotPassword.submit": "Send reset link",
  "auth.forgotPassword.sending": "Sending…",
  /* Shown for both known and unknown addresses, so it must not hint at which. */
  "auth.forgotPassword.sent":
    "If an account exists for that email, a reset link is on its way.",
  "auth.forgotPassword.remembered": "Remembered it?",

  "auth.resetPassword.title": "Choose a new password",
  "auth.resetPassword.submit": "Change password",
  "auth.resetPassword.doneTitle": "Password changed",
  "auth.resetPassword.doneText": "Your password has been changed.",
  "auth.resetPassword.invalidTitle": "Reset link invalid",
  "auth.resetPassword.invalidText":
    "This password reset link is missing or has expired.",
  "auth.resetPassword.requestNew": "Request a new link",

  "auth.verifyEmail.failedTitle": "Verification failed",
  "auth.verifyEmail.failedText":
    "We could not verify your email address. The link may have expired or already been used.",
  "auth.verifyEmail.resend": "Resend verification email",
  "auth.verifyEmail.verifiedTitle": "Email verified",
  "auth.verifyEmail.verifiedText": "Your email address has been verified.",
} as const;
