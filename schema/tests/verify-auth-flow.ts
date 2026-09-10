import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect } from "kysely";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuth } from "../../lib/auth";
import type { Database } from "../../lib/db";

const MIG = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations") + "/";
const SESSION_COOKIE = "better-auth.session_token";

const pglite = new PGlite();
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

// Extract the session-token cookie value from the response headers produced by
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

for (const f of ["0001_init.sql", "0002_seed_vocabularies.sql", "0003_social.sql", "0004_auth.sql"]) {
  await pglite.exec(readFileSync(MIG + f, "utf8"));
}
check("0001-0004 apply", true);

const db = new Kysely<Database>({ dialect: new PGliteDialect({ pglite }) });
const auth = createAuth(db);

// ---- sign-up validation ----------------------------------------------------
await expectError("sign-up rejects a short password", () =>
  auth.api.signUpEmail({ body: { email: "short@example.com", password: "short", name: "Short" } }),
);

const signup = (await auth.api.signUpEmail({
  body: { email: "flow@example.com", password: "supersecret123", name: "Flow User" },
  returnHeaders: true,
})) as unknown as { headers: Headers; response: { token: string; user: { id: string } } };

const userId = signup.response.user.id;
check("sign-up returns a uuid user id", /^[0-9a-f-]{36}$/.test(userId), userId);

const signupCookie = sessionCookie(signup.headers);
check("sign-up sets a session cookie", signupCookie !== null);

await expectError("sign-up rejects a duplicate email", () =>
  auth.api.signUpEmail({ body: { email: "flow@example.com", password: "supersecret123", name: "Dup" } }),
);

// ---- authenticated user id matches app_user.id ----------------------------
const row = await db
  .selectFrom("app_user")
  .select(["id", "email"])
  .where("id", "=", userId)
  .executeTakeFirst();
check("session user id matches app_user.id", row?.id === userId, row?.email ?? "");

// ---- session retrieval -----------------------------------------------------
const session = await auth.api.getSession({
  headers: new Headers({ cookie: signupCookie ?? "" }),
});
check("getSession returns the authenticated user", session?.user.id === userId);

// ---- unauthenticated access rejected --------------------------------------
const anon = await auth.api.getSession({ headers: new Headers() });
check("getSession returns null when unauthenticated", anon === null);

// ---- sign-in validation ----------------------------------------------------
await expectError("sign-in rejects a wrong password", () =>
  auth.api.signInEmail({ body: { email: "flow@example.com", password: "wrongpassword" } }),
);

const signin = (await auth.api.signInEmail({
  body: { email: "flow@example.com", password: "supersecret123" },
  returnHeaders: true,
})) as unknown as { headers: Headers; response: { token: string; user: { id: string } } };

check("sign-in returns a session token", signin.response.token.length > 0);
const signinCookie = sessionCookie(signin.headers);

// ---- sign-out invalidates the session -------------------------------------
await auth.api.signOut({ headers: new Headers({ cookie: signinCookie ?? "" }) });
const after = await auth.api.getSession({ headers: new Headers({ cookie: signinCookie ?? "" }) });
check("sign-out invalidates the session", after === null);

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
