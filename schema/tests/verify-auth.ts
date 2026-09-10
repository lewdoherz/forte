import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect } from "kysely";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuth } from "../../lib/auth";
import type { Database } from "../../lib/db";

const MIG = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations") + "/";
const pglite = new PGlite();
let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
}

async function expectFail(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    failed++;
    out.push(`FAIL  ${label}  [expected an error]`);
  } catch {
    out.push(`PASS  ${label}`);
  }
}

for (const f of ["0001_init.sql", "0002_seed_vocabularies.sql", "0003_social.sql", "0004_auth.sql"]) {
  await pglite.exec(readFileSync(MIG + f, "utf8"));
}
check("0001-0004 apply", true);

const tables = await pglite.query<{ table_name: string }>(
  `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
);
const names = tables.rows.map((r) => r.table_name);
check("19 tables created", names.length === 19, `n=${names.length}`);
check(
  "auth tables exist",
  ["account", "session", "verification"].every((t) => names.includes(t)),
  names.filter((t) => ["account", "session", "verification"].includes(t)).join(","),
);

// ---- username nullable + email_verified default (0004) ---------------------
await pglite.query(`insert into app_user (email) values ('anon@example.com')`);
const anon = await pglite.query<{ username: string | null; email_verified: boolean }>(
  `select username, email_verified from app_user where email = 'anon@example.com'`,
);
check("username is nullable (0004)", anon.rows[0]?.username === null);
check("email_verified defaults false", anon.rows[0]?.email_verified === false);

// ---- session constraints ---------------------------------------------------
const anonId = (await pglite.query<{ id: string }>(`select id from app_user where email = 'anon@example.com'`)).rows[0].id;
await pglite.query(`insert into session (user_id, token, expires_at) values ($1,'tok-dup',now())`, [anonId]);
await expectFail("rejects duplicate session token", () =>
  pglite.query(`insert into session (user_id, token, expires_at) values ($1,'tok-dup',now())`, [anonId]),
);

// ---- FK cascade: deleting a user removes session/account -------------------
const cascade = await pglite.query<{ id: string }>(`insert into app_user (email) values ('cascade@example.com') returning id`);
const cascadeId = cascade.rows[0].id;
await pglite.query(`insert into session (user_id, token, expires_at) values ($1,'tok-cascade',now())`, [cascadeId]);
await pglite.query(`insert into account (user_id, account_id, provider_id) values ($1,'acc-1','credential')`, [cascadeId]);
await pglite.query(`delete from app_user where id = $1`, [cascadeId]);
const orphans = await pglite.query<{ n: number }>(
  `select (select count(*) from session where user_id = $1) + (select count(*) from account where user_id = $1) as n`,
  [cascadeId],
);
check("deleting a user cascades to session and account", orphans.rows[0].n === 0);

// ---- end-to-end Better Auth signup ----------------------------------------
const db = new Kysely<Database>({ dialect: new PGliteDialect({ pglite }) });
const auth = createAuth(db);

const res = await auth.api.signUpEmail({
  body: { email: "auth@example.com", password: "supersecret123", name: "Test User" },
});
check(
  "Better Auth signup returns a uuid user id",
  typeof res.user.id === "string" && /^[0-9a-f-]{36}$/.test(res.user.id),
  res.user.id,
);

const authUser = await pglite.query<{ username: string | null; email_verified: boolean; display_name: string | null }>(
  `select username, email_verified, display_name from app_user where id = $1`,
  [res.user.id],
);
check(
  "signup wrote app_user row (email_verified=false, username=null)",
  authUser.rows.length === 1 && authUser.rows[0].email_verified === false && authUser.rows[0].username === null,
  JSON.stringify(authUser.rows[0]),
);

const account = await pglite.query<{ provider_id: string; password: string | null }>(
  `select provider_id, password from account where user_id = $1`,
  [res.user.id],
);
check(
  "credential account created with a password hash",
  account.rows.length === 1 && account.rows[0].provider_id === "credential" && !!account.rows[0].password,
);

const sessionRows = await pglite.query<{ id: string }>(`select id from session where user_id = $1`, [res.user.id]);
check("session created on signup", sessionRows.rows.length === 1);

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
