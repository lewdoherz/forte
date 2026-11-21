import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createTestDatabase } from "./harness";

// Real Better Auth handlers, signed identity tokens, cookies, SQL and sessions.
// Only remote provider HTTP is simulated; this is NOT live-provider approval.
Object.assign(process.env, { NODE_ENV: "test", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "social-auth-verification-secret-over-32-characters" });
for (const key of ["GOOGLE", "APPLE", "FACEBOOK", "LINKEDIN"]) {
  process.env[`${key}_CLIENT_ID`] = `${key.toLowerCase()}-fixture-client`;
  process.env[`${key}_CLIENT_SECRET`] = "fixture-secret-not-a-provider-credential";
  process.env[`${key}_VERIFIED`] = "true";
}
delete process.env.EMAIL_API_KEY;
const mailDir = join(process.cwd(), ".mail");
const mailBefore = new Set(await readdir(mailDir).catch(() => [] as string[]));
const { createAuth } = await import("../../lib/auth");
const { providerIdentity } = await import("../../lib/social-provider-config");
const { db, close } = await createTestDatabase();
const auth = createAuth(db);
const origin = "http://localhost:3000";
let failures = 0;
let checks = 0;
function check(name: string, ok: boolean) { checks++; if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); }
function cookies(response: Response) { return response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "); }
async function post(path: string, body: object, cookie = "", userAgent = "Verification browser") {
  return auth.handler(new Request(`${origin}/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json", origin, cookie, "user-agent": userAgent }, body: JSON.stringify(body) }));
}
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "fixture-key", alg: "RS256", use: "sig" };
function jwt(claims: object) {
  const data = `${Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture-key" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
}
type Provider = "google" | "apple" | "facebook" | "linkedin";
type Profile = { sub: string; email?: string; email_verified?: boolean | string; name?: string; nonce?: string };
const profiles = new Map<string, { provider: Provider; profile: Profile }>();
const originalFetch = globalThis.fetch;
let remoteCalls = 0;
globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!["oauth2.googleapis.com", "www.googleapis.com", "appleid.apple.com", "graph.facebook.com", "www.linkedin.com", "api.linkedin.com"].includes(url.hostname)) return originalFetch(input, init);
  remoteCalls++;
  if (url.pathname.endsWith("/certs") || url.pathname === "/auth/keys") return Response.json({ keys: [jwk] });
  if (url.pathname.endsWith("/token") || url.pathname.endsWith("/access_token") || url.pathname.endsWith("/accessToken")) {
    const params = new URLSearchParams(typeof init?.body === "string" ? init.body : String(init?.body ?? ""));
    const code = params.get("code") ?? url.searchParams.get("code") ?? "";
    const entry = profiles.get(code);
    if (!entry) return Response.json({ error: "invalid_grant" }, { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    return Response.json({ access_token: code, token_type: "Bearer", expires_in: 3600,
      ...(entry.provider === "google" || entry.provider === "apple" ? { id_token: jwt({ ...entry.profile, iss: entry.provider === "google" ? "https://accounts.google.com" : "https://appleid.apple.com", aud: `${entry.provider}-fixture-client`, iat: now, exp: now + 3600 }) } : {}),
    });
  }
  if (url.pathname === "/debug_token") {
    const entry = profiles.get(url.searchParams.get("input_token") ?? "");
    return Response.json({ data: { is_valid: !!entry, app_id: "facebook-fixture-client", user_id: entry?.profile.sub } });
  }
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const entry = profiles.get((headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  if (!entry) return Response.json({ error: "invalid_token" }, { status: 401 });
  return Response.json({ ...entry.profile, id: entry.profile.sub, picture: entry.provider === "facebook" ? { data: { url: "" } } : "" });
}, originalFetch);
async function begin(provider: Provider, profile: Profile, cookie = "", linking = false) {
  const response = await post(linking ? "link-social" : "sign-in/social", { provider, callbackURL: linking ? "/account" : "/auth/complete", errorCallbackURL: "/sign-in?social=error" }, cookie);
  const data: unknown = await response.json();
  if (!response.ok || !data || typeof data !== "object" || !("url" in data) || typeof data.url !== "string") throw Error(`OAuth initiation failed: ${response.status}`);
  const url = new URL(data.url);
  const code = randomBytes(18).toString("base64url");
  profiles.set(code, { provider, profile: { ...profile, ...(url.searchParams.get("nonce") ? { nonce: url.searchParams.get("nonce")! } : {}) } });
  return { provider, code, url, state: url.searchParams.get("state")!, cookie: [cookie, cookies(response)].filter(Boolean).join("; ") };
}
async function callback(flow: Awaited<ReturnType<typeof begin>>, error?: string) {
  const params = new URLSearchParams({ state: flow.state, ...(error ? { error } : { code: flow.code }) });
  const response = await auth.handler(new Request(`${origin}/api/auth/callback/${flow.provider}${flow.provider === "apple" ? "" : `?${params}`}`, {
    method: flow.provider === "apple" ? "POST" : "GET", headers: { cookie: flow.cookie, ...(flow.provider === "apple" ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    ...(flow.provider === "apple" ? { body: params.toString() } : {}),
  }));
  // Apple's form-post handler redirects to its same-origin GET callback. A real
  // browser follows this before code validation; do not mistake it for success.
  const location = response.headers.get("location");
  if (location) {
    const target = new URL(location, origin);
    if (target.origin === origin && target.pathname === `/api/auth/callback/${flow.provider}`) {
      return auth.handler(new Request(target, { headers: { cookie: flow.cookie } }));
    }
  }
  return response;
}
async function session(response: Response) { return auth.api.getSession({ headers: new Headers({ cookie: cookies(response) }) }); }
try {
  const email = "social-fixture@example.com";
  const signup = await post("sign-up/email", { email, password: "fixture-password-123", name: "Existing athlete" });
  const owner = await session(signup);
  if (!owner) throw Error("Credential registration failed");
  await db.updateTable("app_user").set({ email_verified: true, timezone: "Asia/Shanghai", locale: "zh-CN" }).where("id", "=", owner.user.id).execute();
  await db.insertInto("workout").values({ owner_id: owner.user.id, routine_id: null, title: "Preserved workout", notes: null, started_at: new Date(), ended_at: new Date() }).execute();
  const collision: Profile = { sub: "google-existing", email, email_verified: true };
  const attempt = await begin("google", collision);
  const before = remoteCalls;
  const forged = await callback({ ...attempt, state: "forged" });
  check("forged state cannot call the provider or issue a session", remoteCalls === before && !cookies(forged).includes("session_token"));
  const rejected = await callback(await begin("google", collision));
  check("matching verified email cannot implicitly link or enter an existing account", !(await session(rejected)) && (await db.selectFrom("account").where("user_id", "=", owner.user.id).where("provider_id", "=", "google").selectAll().execute()).length === 0);
  const linked = await callback(await begin("google", collision, cookies(signup), true));
  check("explicit authenticated linking binds the provider to the same identity", linked.headers.get("location")?.endsWith("/account") === true && !!await db.selectFrom("account").where("user_id", "=", owner.user.id).where("provider_id", "=", "google").select("id").executeTakeFirst());
  const afterLink = await callback(await begin("google", collision));
  check("new Google login after linking keeps the original user ID", (await session(afterLink))?.user.id === owner.user.id);
  const second = await post("sign-up/email", { email: "second-fixture@example.com", password: "fixture-password-123", name: "Another athlete" });
  await callback(await begin("google", collision, cookies(second), true));
  const binding = await db.selectFrom("account").where("provider_id", "=", "google").where("account_id", "=", collision.sub).select("user_id").executeTakeFirst();
  check("another authenticated account cannot steal an already linked identity", binding?.user_id === owner.user.id);
  const originalCredential = await post("sign-in/email", { email, password: "fixture-password-123" });
  check("credential login stays independent after linking", (await session(originalCredential))?.user.id === owner.user.id);
  for (const provider of ["google", "apple", "facebook", "linkedin"] as const) {
    const profile: Profile = { sub: `${provider}-new`, ...(provider === "facebook" ? {} : { email: provider === "apple" ? "relay-fixture@privaterelay.appleid.com" : `${provider}-fixture@example.com`, email_verified: true }), name: "Fixture athlete" };
    const flow = await begin(provider, profile);
    const scopes = new Set((flow.url.searchParams.get("scope") ?? "").split(/[ ,]+/));
    check(`${provider} requests only identity/contact scopes`, [...scopes].every(s => ["openid", "email", "public_profile"].includes(s)) && scopes.size > 0);
    const response = await callback(flow);
    const first = await session(response);
    check(`${provider} valid provider proof creates an app session`, !!first);
    if (!first) throw Error(`${provider} callback failed: ${response.headers.get("location")}`);
    const returning = await callback(await begin(provider, { ...profile, email: undefined }));
    check(`${provider} returning subject survives an omitted email without a new identity`, (await session(returning))?.user.id === first.user.id);
    const replay = await callback(flow);
    check(`${provider} callback cannot be replayed`, !(await session(replay)));
    const cancelled = await callback(await begin(provider, profile), "access_denied");
    check(`${provider} cancellation does not create a session`, !(await session(cancelled)) && cancelled.headers.get("location")?.includes("social=error") === true);
    if (provider === "facebook") {
      check("missing email remains non-deliverable and unverified", first.user.email.endsWith("@social.placeholder.invalid") && !first.user.emailVerified);
      check("reserved identities cannot be password-recovered", (await post("request-password-reset", { email: first.user.email })).status === 400);
      const enrollment = await post("change-email", { newEmail: "recovered-fixture@example.com", callbackURL: "/account" }, cookies(response));
      const unchanged = await db.selectFrom("app_user").where("id", "=", first.user.id).select("email").executeTakeFirstOrThrow();
      check("contact enrollment waits for mailbox verification", enrollment.ok && unchanged.email === first.user.email);
      const name = (await readdir(mailDir)).filter(n => n.endsWith("-recovered-fixture@example.com.html")).sort().at(-1);
      const html = name ? await readFile(join(mailDir, name), "utf8") : "";
      const token = html.match(/\/verify-email\?token=([A-Za-z0-9._-]+)/)?.[1];
      if (!token) throw Error("Contact verification mail missing");
      await auth.api.verifyEmail({ query: { token } });
      const recovered = await db.selectFrom("app_user").where("id", "=", first.user.id).select(["email", "email_verified"]).executeTakeFirstOrThrow();
      check("verified contact attaches to the same provider-only account", recovered.email === "recovered-fixture@example.com" && recovered.email_verified);
      await post("request-password-reset", { email: recovered.email, redirectTo: "/reset-password" });
      const resetName = (await readdir(mailDir)).filter(n => n.endsWith("-recovered-fixture@example.com.html")).sort().at(-1);
      const resetHtml = resetName ? await readFile(join(mailDir, resetName), "utf8") : "";
      const reset = resetHtml.match(/\/reset-password\/([A-Za-z0-9_-]+)/)?.[1];
      if (!reset) throw Error("Credential enrollment mail missing");
      await auth.api.resetPassword({ body: { token: reset, newPassword: "enrolled-password-123" } });
      const credential = await post("sign-in/email", { email: recovered.email, password: "enrolled-password-123" });
      check("verified recovery enrolls independent credentials without changing identity", (await session(credential))?.user.id === first.user.id);
    }
  }
  const blocked = await post("sign-in/social", { provider: "google" }, "", "ForteAndroid/1");
  check("embedded clients cannot initiate provider OAuth inside WebView", blocked.status === 400);
  for (const userAgent of ["Mozilla/5.0 (Linux; Android 11; wv) AppleWebKit/537.36", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"]) {
    check("legacy WebViews cannot fall through to provider OAuth", (await post("sign-in/social", { provider: "google" }, "", userAgent)).status === 400);
  }
  check("retired WeChat is not an authentication provider", (await post("sign-in/social", { provider: "wechat" })).status === 404);
  check("Apple relay addresses stay contact addresses, never an automatic merge key", providerIdentity("apple", { sub: "relay", email: "relay@privaterelay.appleid.com", email_verified: "true" }).emailVerified);
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  async function authorize(cookie: string) { return auth.handler(new Request(`${origin}/api/auth/native/authorize?${new URLSearchParams({ challenge, state, platform: "android" })}`, { headers: { cookie } })); }
  check("native authorization requires an authenticated browser", (await authorize("")).status === 401);
  const native = await authorize(cookies(originalCredential));
  const returnUrl = new URL(native.headers.get("location")!);
  const code = returnUrl.searchParams.get("code")!;
  check("native return exposes only an opaque code bound to app state", returnUrl.protocol === "forte:" && returnUrl.host === "auth" && returnUrl.pathname === "/callback" && returnUrl.searchParams.get("state") === state && !returnUrl.href.includes("session_token"));
  check("wrong PKCE verifier cannot exchange a stolen code", (await post("native/exchange", { code, verifier: randomBytes(32).toString("base64url"), platform: "android" })).status === 400);
  check("native code is platform-bound", (await post("native/exchange", { code, verifier, platform: "ios" })).status === 400);
  const exchanged = await post("native/exchange", { code, verifier, platform: "android" });
  check("native exchange installs an HttpOnly same-origin session for the original identity", exchanged.ok && (await session(exchanged))?.user.id === owner.user.id && exchanged.headers.getSetCookie().some(c => c.includes("HttpOnly") && c.includes("Path=/")));
  check("native exchange returns no session secret in JSON", JSON.stringify(await exchanged.json()) === '{"ok":true}');
  check("native code cannot be replayed", (await post("native/exchange", { code, verifier, platform: "android" })).status === 400);
  const racing = new URL((await authorize(cookies(originalCredential))).headers.get("location")!).searchParams.get("code")!;
  const races = await Promise.all([post("native/exchange", { code: racing, verifier, platform: "android" }), post("native/exchange", { code: racing, verifier, platform: "android" })]);
  check("concurrent native exchange succeeds exactly once", races.filter(r => r.ok).length === 1);
  const expired = new URL((await authorize(cookies(originalCredential))).headers.get("location")!).searchParams.get("code")!;
  await db.updateTable("verification").set({ expires_at: new Date(0) }).where("identifier", "like", "forte-native:v1:%").execute();
  check("expired native authorization is unusable", (await post("native/exchange", { code: expired, verifier, platform: "android" })).status === 400);
  const cancellation = await auth.handler(new Request(`${origin}/api/auth/native/cancel?state=${state}`));
  check("native cancellation returns app state without replacing an existing session", new URL(cancellation.headers.get("location")!).searchParams.get("error") === "cancelled" && (await session(originalCredential))?.user.id === owner.user.id);
  const history = await db.selectFrom("workout").where("owner_id", "=", owner.user.id).select("id").execute();
  const settings = await db.selectFrom("app_user").where("id", "=", owner.user.id).select(["timezone", "locale"]).executeTakeFirstOrThrow();
  check("switching methods preserves workout ownership and settings", history.length === 1 && settings.timezone === "Asia/Shanghai" && settings.locale === "zh-CN");
  await auth.api.signOut({ headers: new Headers({ cookie: cookies(exchanged) }) });
  check("native-created session signs out through ordinary auth", await session(exchanged) === null);
} finally {
  globalThis.fetch = originalFetch;
  await close();
  for (const name of await readdir(mailDir).catch(() => [] as string[])) if (!mailBefore.has(name) && /-([a-z-]+-fixture@example\.com|relay-fixture@privaterelay\.appleid\.com)\.html$/.test(name)) await rm(join(mailDir, name));
}
console.log(`${checks - failures}/${checks} social/native auth checks passed (simulated provider HTTP only)`);
process.exit(failures ? 1 : 0);
