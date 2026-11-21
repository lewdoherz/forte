import { readFile } from "node:fs/promises";
import { createTestDatabase } from "./harness";

const fixture = await createTestDatabase();
const audit = await readFile(new URL("../migrations/0018_auth_retirement_audit.sql", import.meta.url), "utf8");
let failures = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
}
async function permitted() {
  try { await fixture.exec(audit); return true; }
  catch (error) {
    if (error instanceof Error && error.message.includes("WeChat retirement blocked")) return false;
    throw error;
  }
}
try {
  check("credential-only deployments can retire the absent provider", await permitted());
  const { rows: [user] } = await fixture.query<{ id: string }>(
    "insert into app_user (email, display_name, timezone, locale) values ('retirement@social.placeholder.invalid', 'Existing athlete', 'Asia/Shanghai', 'zh-CN') returning id",
  );
  await fixture.exec(`insert into account(user_id, provider_id, account_id) values ('${user.id}', 'wechat', 'existing-provider-subject')`);
  await fixture.exec(`insert into workout(owner_id, title, started_at) values ('${user.id}', 'Preserved history', now())`);
  check("a provider-only account blocks cutover instead of being stranded", !(await permitted()));
  await fixture.exec(`insert into account(user_id, provider_id, account_id) values ('${user.id}', 'google', 'other-provider-subject')`);
  check("an unverified replacement provider is not treated as recovered access", !(await permitted()));
  await fixture.exec(`insert into account(user_id, provider_id, account_id, password) values ('${user.id}', 'credential', '${user.id}', '')`);
  check("an empty credential does not bypass the retirement gate", !(await permitted()));
  await fixture.exec(`update account set password = 'enrolled-credential-hash' where user_id='${user.id}' and provider_id='credential'`);
  check("credential enrollment on the original identity permits retirement", await permitted());
  const { rows: preserved } = await fixture.query<{ id: string; timezone: string; locale: string; workouts: number }>(
    "select u.id, u.timezone, u.locale, (select count(*)::integer from workout w where w.owner_id=u.id) workouts from app_user u where u.id=$1", [user.id],
  );
  check("the audit preserves identity, workout ownership and settings", preserved[0]?.id === user.id && preserved[0]?.workouts === 1 && preserved[0]?.timezone === "Asia/Shanghai" && preserved[0]?.locale === "zh-CN");
} finally { await fixture.close(); }
if (failures) process.exit(1);
