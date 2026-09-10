import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { gatherAccountExport } from "../../lib/account-export";
import { createAuth } from "../../lib/auth";
import { createCustomExercise } from "../../lib/exercises";
import { createRoutine } from "../../lib/routines";
import { startWorkout } from "../../lib/workouts";
import { createTestDatabase } from "./harness";

const SESSION_COOKIE = "better-auth.session_token";
/** Development mail sink; `lib/email.ts` writes here while `EMAIL_API_KEY` is unset. */
const MAIL_DIR = join(process.cwd(), ".mail");

let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
}

async function expectError(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    failed++;
    out.push(`FAIL  ${label}  [expected an error]`);
  } catch {
    out.push(`PASS  ${label}`);
  }
}

// ---- development mailbox ---------------------------------------------------
// The link is the only place a token appears: this Better Auth version signs the
// verification token and stores only the reset token, so what the account
// actually receives is what the flow has to be driven from. The directory is
// snapshotted before the first send so teardown removes exactly the messages
// this suite created, never a developer's saved mail.
let mailBefore = new Set<string>();
try {
  mailBefore = new Set(await readdir(MAIL_DIR));
} catch {
  // Absent until the first message; the transport creates it on demand.
}

/**
 * Newest message addressed to `recipient`.
 *
 * Names are `<flattened-ISO-timestamp>-<recipient>.html` with a fixed-width
 * timestamp, so a plain descending string sort is a chronological sort.
 */
async function newestMailTo(recipient: string): Promise<string | null> {
  const names = (await readdir(MAIL_DIR)).filter((name) => name.includes(recipient)).sort().reverse();
  if (names.length === 0) return null;
  return readFile(join(MAIL_DIR, names[0]), "utf8");
}

/** Better Auth builds the verification link as `.../verify-email?token=<jwt>`. */
function verificationToken(html: string): string | null {
  return html.match(/\/verify-email\?token=([A-Za-z0-9._-]+)/)?.[1] ?? null;
}

/** The reset link carries its token in the path: `.../reset-password/<token>`. */
function resetToken(html: string): string | null {
  return html.match(/\/reset-password\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

// Extract the session-token cookie from the response headers produced by
// `returnHeaders: true`.
function sessionCookie(headers: Headers): string | null {
  const raw = headers.get("set-cookie");
  if (!raw) return null;
  for (const part of raw.split(/,(?=\s*[A-Za-z0-9_-]+=)/)) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE}=`)) {
      return trimmed.split(";")[0];
    }
  }
  return null;
}

const { db, query, close, dialect } = await createTestDatabase();
check(`schema migrations apply (${dialect})`, true);

const auth = createAuth(db);

const mkUser = async (email: string) =>
  (await query<{ id: string }>(`insert into app_user (email) values ($1) returning id`, [email])).rows[0].id;

// ---- sign-in does not require a verified address ---------------------------
// Verification is deliberately optional (`requireEmailVerification` is unset) so
// accounts created before the flow existed are not stranded. Pinned as policy:
// turning enforcement on without a grandfathering path should fail here first.
const unverifiedEmail = "lc-unverified@example.com";
const unverifiedPassword = "supersecret123";
await auth.api.signUpEmail({
  body: { email: unverifiedEmail, password: unverifiedPassword, name: "Unverified" },
});
const unverifiedSignin = await auth.api.signInEmail({
  body: { email: unverifiedEmail, password: unverifiedPassword },
});
check("an unverified account can sign in", unverifiedSignin.user.email === unverifiedEmail, unverifiedSignin.user.id);

const unverifiedRow = await query<{ email_verified: boolean }>(
  `select email_verified from app_user where id = $1`,
  [unverifiedSignin.user.id],
);
check(
  "the account that signed in is still unverified in the database",
  unverifiedRow.rows[0]?.email_verified === false,
);

// ---- sign-up emits a verification message ----------------------------------
const verifyEmail = "lc-verify@example.com";
const verifySignup = (await auth.api.signUpEmail({
  body: { email: verifyEmail, password: "supersecret123", name: "Verify Me" },
  returnHeaders: true,
})) as unknown as { headers: Headers; response: { user: { id: string } } };
const verifyUserId = verifySignup.response.user.id;

const verificationMessage = await newestMailTo(verifyEmail);
check("sign-up writes a verification message for the new address", verificationMessage !== null);
check(
  "the verification message carries a verification link",
  verificationMessage !== null && /\/verify-email\?token=/.test(verificationMessage),
);

const verification = verificationMessage === null ? null : verificationToken(verificationMessage);
check("the verification link carries a token", verification !== null);

// ---- completing the emailed link sets email_verified ------------------------
const beforeVerify = await query<{ email_verified: boolean }>(
  `select email_verified from app_user where id = $1`,
  [verifyUserId],
);
check("a freshly signed-up account starts unverified", beforeVerify.rows[0]?.email_verified === false);

// Driving the endpoint with the token from the delivered link is what makes
// this end to end: it is the same value the browser would submit.
await auth.api.verifyEmail({ query: { token: verification! } });

const afterVerify = await query<{ email_verified: boolean }>(
  `select email_verified from app_user where id = $1`,
  [verifyUserId],
);
check("verifying the emailed link sets email_verified in the database", afterVerify.rows[0]?.email_verified === true);

// ---- password reset rotates the credential and revokes sessions ------------
const resetEmail = "lc-reset@example.com";
const oldPassword = "supersecret123";
const newPassword = "brandnewpass456";
const resetSignup = (await auth.api.signUpEmail({
  body: { email: resetEmail, password: oldPassword, name: "Reset Me" },
  returnHeaders: true,
})) as unknown as { headers: Headers; response: { user: { id: string } } };
const resetUserId = resetSignup.response.user.id;

const credentialBefore = (
  await query<{ password: string | null }>(
    `select password from account where user_id = $1 and provider_id = 'credential'`,
    [resetUserId],
  )
).rows[0]?.password ?? null;

// Two independent sessions: the one sign-up created and one from an explicit
// sign-in. Both must die with the old password, or a stolen session would
// survive the reset that was meant to end the attacker's access.
const firstSession = sessionCookie(resetSignup.headers);
const secondSignin = (await auth.api.signInEmail({
  body: { email: resetEmail, password: oldPassword },
  returnHeaders: true,
})) as unknown as { headers: Headers; response: { token: string } };
const secondSession = sessionCookie(secondSignin.headers);
check("both sign-ups produce a session cookie", firstSession !== null && secondSession !== null);

const sessionsBefore = await query<{ n: number }>(
  `select count(*)::int as n from session where user_id = $1`,
  [resetUserId],
);
check("two sessions exist before the reset", sessionsBefore.rows[0].n === 2, `n=${sessionsBefore.rows[0].n}`);

await auth.api.requestPasswordReset({ body: { email: resetEmail } });
const resetMessage = await newestMailTo(resetEmail);
check("requesting a reset writes a reset message", resetMessage !== null);

const reset = resetMessage === null ? null : resetToken(resetMessage);
check("the reset link carries a token", reset !== null);

await auth.api.resetPassword({ body: { newPassword, token: reset! } });

const credentialAfter = (
  await query<{ password: string | null }>(
    `select password from account where user_id = $1 and provider_id = 'credential'`,
    [resetUserId],
  )
).rows[0]?.password ?? null;
check(
  "reset replaces the stored credential hash",
  credentialBefore !== null && credentialAfter !== null && credentialBefore !== credentialAfter,
);

const sessionsAfter = await query<{ n: number }>(
  `select count(*)::int as n from session where user_id = $1`,
  [resetUserId],
);
check(
  "reset revokes every existing session",
  sessionsAfter.rows[0].n === 0,
  `n=${sessionsAfter.rows[0].n}`,
);

const staleSession = await auth.api.getSession({ headers: new Headers({ cookie: firstSession ?? "" }) });
check("a pre-reset session cookie is no longer accepted", staleSession === null);

await expectError("the old password no longer signs in", () =>
  auth.api.signInEmail({ body: { email: resetEmail, password: oldPassword } }),
);
const newSignin = await auth.api.signInEmail({ body: { email: resetEmail, password: newPassword } });
check("the new password signs in", newSignin.user.id === resetUserId);

// ---- deletion removes everything the account owned -------------------------
const deleteEmail = "lc-delete@example.com";
const deleteSignup = (await auth.api.signUpEmail({
  body: { email: deleteEmail, password: "supersecret123", name: "Delete Me" },
  returnHeaders: true,
})) as unknown as { headers: Headers; response: { user: { id: string } } };
const deleteUserId = deleteSignup.response.user.id;
const deleteCookie = sessionCookie(deleteSignup.headers);

const systemExercises = await db
  .selectFrom("exercise_template")
  .selectAll()
  .where("is_custom", "=", false)
  .execute();
const bench = systemExercises.find((e) => e.title === "Bench Press");
check("seed fixtures present", bench !== undefined);

const ownedRoutine = await createRoutine(db, deleteUserId, {
  title: "Delete Day",
  notes: null,
  exercises: [
    {
      template_id: bench!.id,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", reps: 5, weight_kg: "60" }],
    },
  ],
});
await startWorkout(db, deleteUserId, ownedRoutine.id);

// Count every row the account is supposed to own before deletion, so the
// all-zero assertion afterwards cannot pass vacuously.
const ownedBefore = await query<{
  routines: number;
  workouts: number;
  sessions: number;
  accounts: number;
}>(
  `select (select count(*)::int from routine where owner_id = $1) as routines,
          (select count(*)::int from workout where owner_id = $1) as workouts,
          (select count(*)::int from session where user_id = $1) as sessions,
          (select count(*)::int from account where user_id = $1) as accounts`,
  [deleteUserId],
);
check(
  "the account owns a routine, workout, session and credential before deletion",
  ownedBefore.rows[0].routines === 1 &&
    ownedBefore.rows[0].workouts === 1 &&
    ownedBefore.rows[0].sessions === 1 &&
    ownedBefore.rows[0].accounts === 1,
  JSON.stringify(ownedBefore.rows[0]),
);

await auth.api.deleteUser({
  body: { callbackURL: "/" },
  headers: new Headers({ cookie: deleteCookie ?? "" }),
});

const userGone = await query<{ n: number }>(`select count(*)::int as n from app_user where id = $1`, [deleteUserId]);
check("deleting the account removes the app_user row", userGone.rows[0].n === 0);

const orphans = await query<{ n: number }>(
  `select (select count(*)::int from routine where owner_id = $1)
        + (select count(*)::int from workout where owner_id = $1)
        + (select count(*)::int from session where user_id = $1)
        + (select count(*)::int from account where user_id = $1) as n`,
  [deleteUserId],
);
check("deletion cascades to routines, workouts, sessions and accounts", orphans.rows[0].n === 0);

// ---- export is owner-scoped ------------------------------------------------
// The worst failure this feature can have is handing one account another's
// training data, so every collection is checked in both directions.
const ownerA = await mkUser("lc-export-a@example.com");
const ownerB = await mkUser("lc-export-b@example.com");

const customA = await createCustomExercise(db, ownerA, {
  title: "A Secret Press",
  exercise_type: "weight_reps",
  primary_muscle: "chest",
  secondary_muscles: [],
  equipment: "barbell",
});
const customB = await createCustomExercise(db, ownerB, {
  title: "B Secret Row",
  exercise_type: "weight_reps",
  primary_muscle: "chest",
  secondary_muscles: [],
  equipment: "barbell",
});

const routineA = await createRoutine(db, ownerA, {
  title: "A Push",
  notes: null,
  exercises: [
    {
      template_id: bench!.id,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", reps: 5, weight_kg: "60" }],
    },
  ],
});
const routineB = await createRoutine(db, ownerB, {
  title: "B Push",
  notes: null,
  exercises: [
    {
      template_id: bench!.id,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", reps: 5, weight_kg: "60" }],
    },
  ],
});
const workoutA = await startWorkout(db, ownerA, routineA.id);
const workoutB = await startWorkout(db, ownerB, routineB.id);

const exportA = await gatherAccountExport(db, ownerA);
check("the export carries the requesting account's profile", exportA.account?.id === ownerA);
check("the export contains the owner's routine", exportA.routines.some((r) => r.id === routineA.id));
check("the export excludes another account's routine", !exportA.routines.some((r) => r.id === routineB.id));
check("the export contains the owner's workout", exportA.workouts.some((w) => w.id === workoutA.id));
check("the export excludes another account's workout", !exportA.workouts.some((w) => w.id === workoutB.id));
check(
  "the export contains the owner's custom exercise",
  exportA.customExercises.some((e) => e.id === customA.id),
);
check(
  "the export excludes another account's custom exercise",
  !exportA.customExercises.some((e) => e.id === customB.id),
);

const exportB = await gatherAccountExport(db, ownerB);
check(
  "the other account's export is scoped to it as well",
  exportB.routines.some((r) => r.id === routineB.id) && !exportB.routines.some((r) => r.id === routineA.id),
);
check(
  "the other account's export excludes the first account's custom exercise",
  !exportB.customExercises.some((e) => e.id === customA.id),
);

// ---- email rate-limit rules ------------------------------------------------
// These endpoints send to an address the caller chooses, so they carry a mail
// policy rather than the global traffic allowance. Read from the resolved auth
// context — the same object the limiter consults at request time. Exercising the
// limiter itself is not possible here because it runs in the HTTP handler and
// keys on a client IP, neither of which a direct `auth.api` call provides.
//
// The keys are the actual route paths. A rule named after a route that does not
// exist is silently inert, so the assertion below pins the emitted paths and
// rejects the `/forget-password` alias Better Auth never registers.
const configuredRules = ((await auth.$context).rateLimit.customRules ?? {}) as unknown as Record<string, unknown>;
const mailRule = (path: string): { window: number; max: number } | null => {
  const rule = configuredRules[path];
  if (rule === null || typeof rule !== "object") return null;
  const { window, max } = rule as { window?: unknown; max?: unknown };
  return typeof window === "number" && typeof max === "number" ? { window, max } : null;
};
check(
  "the mail endpoints carry mail-specific rate limits",
  mailRule("/request-password-reset")?.max === 3 &&
    mailRule("/request-password-reset")?.window === 60 &&
    mailRule("/send-verification-email")?.max === 3 &&
    mailRule("/send-verification-email")?.window === 60 &&
    mailRule("/reset-password")?.max === 5 &&
    mailRule("/reset-password")?.window === 60,
  JSON.stringify(configuredRules),
);
check(
  "no rate-limit rule names the unregistered /forget-password route",
  !Object.prototype.hasOwnProperty.call(configuredRules, "/forget-password"),
);

// ---- cleanup ---------------------------------------------------------------
// The harness drops its scratch database, so the rows created above need no
// explicit teardown; the development mailbox is the one persistent side effect.
let mailNow: string[] = [];
try {
  mailNow = await readdir(MAIL_DIR);
} catch {
  // No directory means no message was ever written.
}
for (const name of mailNow) {
  if (!mailBefore.has(name)) await rm(join(MAIL_DIR, name), { force: true });
}

await close();
console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
