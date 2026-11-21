import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { chromium, type Browser, type Page } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The critical path, in a real browser.
 *
 * The schema suites stop at the database; the service-worker check stops at the
 * worker's policy. Neither can see the journey a person actually takes: sign in,
 * start a routine, log a set, lose the network and keep logging, come back,
 * finish, and find the workout and its record in history — then leave and prove
 * the next person on the browser sees none of it.
 *
 * It provisions the application the way production runs it:
 *   1. an isolated database on TEST_DATABASE_URL when explicitly supplied, or
 *      temporary embedded PostgreSQL on a private port for zero-config local runs;
 *   2. `db:migrate` and `db:seed:dev` against it, through the real scripts;
 *   3. `next build` and `next start` with a complete production environment,
 *      because the offline leg belongs to the service worker and the worker
 *      registers in production only.
 *
 * Nothing in here re-implements a rule the app owns: the flow is asserted
 * through the rendered surface, and the values it asserts are the demo seed's
 * own numbers.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, ".pgdata-browser");
const PG_PORT = 55433;
const APP_PORT = 3111;
const APP_URL = `http://localhost:${APP_PORT}`;
let DATABASE_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/postgres`;

const DEMO_EMAIL = "demo@forte.local";
const DEMO_PASSWORD = "forte-demo-password";
/** A second account, to prove local data does not cross between people. */
const SECOND_EMAIL = "verify-browser-second@forte.local";
const SECOND_PASSWORD = "forte-verify-second-password";

/**
 * Heavier than anything the seed's Leg Day holds (its squat peaks at 90 kg), so
 * the finished workout has a record to find in history rather than a first
 * performance, which by design records nothing.
 */
const WORKING_WEIGHT = "95";
const WORKING_REPS = "8";

let checks = 0;
let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  checks++;
  if (ok) {
    console.log(`PASS  ${label}${detail ? `  [${detail}]` : ""}`);
    return;
  }
  failures++;
  console.log(`FAIL  ${label}${detail ? `  [${detail}]` : ""}`);
}

function text(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

/** Runs a command to completion, inheriting the current stdio. */
function runCommand(command: string[], env: Record<string, string> = {}): Promise<number> {
  const { promise, resolve } = Promise.withResolvers<number>();
  const child = spawn(command[0], command.slice(1), {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  child.on("exit", (code) => resolve(code ?? 1));
  return promise;
}

/** Starts a command and resolves once it answers, or once it exits early. */
async function startServer(command: string[], env: Record<string, string>): Promise<ChildProcess> {
  const child = spawn(command[0], command.slice(1), {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: "1" },
  });

  const deadline = Date.now() + 120_000;
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  while (Date.now() < deadline) {
    if (exited) throw new Error(`${command.join(" ")} exited before it answered`);
    try {
      const response = await fetch(`${APP_URL}/sign-in`, { redirect: "manual" });
      if (response.status > 0) return child;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${command.join(" ")} never answered on ${APP_URL}`);
}

const adminUrl = process.env.TEST_DATABASE_URL;
const externalDatabaseName = `forte_browser_${process.pid}`;
const admin = adminUrl ? new Pool({ connectionString: adminUrl }) : null;
let externalDatabaseCreated = false;
const pg = adminUrl ? null : new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: PG_PORT,
  persistent: false,
  // UTF8 explicitly. `initdb` on Windows defaults to the console code page
  // (WIN1252 here), and a cluster in that encoding rejects the Chinese literals
  // migration 0017 stores with "has no equivalent in encoding". On Linux UTF8 is
  // already the default, so this only makes the two platforms agree. The locale
  // itself is left alone on purpose: changing it would change collation and with
  // it the order of anything sorted by text.
  initdbFlags: ["--encoding=UTF8"],
});

if (pg) {
  console.log(`starting embedded PostgreSQL on :${PG_PORT} ...`);
  await rm(dataDir, { recursive: true, force: true });
  await pg.initialise();
  await pg.start();
}

let server: ChildProcess | null = null;
let browser: Browser | null = null;
let localeClient: Pool | null = null;

try {
  if (admin && adminUrl) {
    await admin.query(`create database ${externalDatabaseName}`);
    externalDatabaseCreated = true;
    const target = new URL(adminUrl);
    target.pathname = `/${externalDatabaseName}`;
    DATABASE_URL = target.toString();
    console.log("using an isolated database on TEST_DATABASE_URL");
  }

  // Reads the stored language straight from the account row, so the check cannot
  // be satisfied by the cookie alone.
  localeClient = new Pool({ connectionString: DATABASE_URL });
  const storedLocale = async (): Promise<string | null> => {
    const result = await localeClient!.query<{ locale: string }>(
      "select locale from app_user where email = $1",
      [DEMO_EMAIL],
    );
    return result.rows[0]?.locale ?? null;
  };

  for (const [label, script] of [
    ["schema", "scripts/migrate.ts"],
    ["demo seed", "scripts/seed-dev.ts"],
  ] as const) {
    console.log(`\n$ ${label} (${script})`);
    const code = await runCommand([process.execPath, join(root, script)], { DATABASE_URL });
    if (code !== 0) throw new Error(`${script} exited with ${code}`);
  }

  // The runner needs a production build on whatever machine it is run from.
  // Turbopack aliases server externals through directory junctions, and hardened
  // Windows configurations refuse to traverse a junction they did not create
  // ("untrusted mount point"), which makes `next build` fail there for reasons
  // that have nothing to do with this app. The webpack pipeline is portable and
  // produces the same server; keeping Turbopack healthy stays CI's job.
  console.log("\n$ bun run build --webpack");
  const build = await runCommand(["bun", "run", "build", "--webpack"]);
  if (build !== 0) throw new Error(`next build exited with ${build}`);

  console.log(`\n$ next start on :${APP_PORT}`);
  // Next's CLI is spawned directly rather than through `bun run start`: the extra
  // wrapper would be the only process we hold a handle to, and killing it leaves
  // the server itself running (and holding this script's stdout open).
  server = await startServer(
    [process.execPath, join(root, "node_modules", "next", "dist", "bin", "next"), "start"],
    {
      NODE_ENV: "production",
      PORT: String(APP_PORT),
      DATABASE_URL,
      BETTER_AUTH_SECRET: "verify-browser-secret-at-least-32-characters",
      BETTER_AUTH_URL: APP_URL,
      EMAIL_API_KEY: "re_verify_browser_not_a_real_key",
      EMAIL_FROM: "forte <verify-browser@example.com>",
      // The deployed instance's mode: the platform sets the client IP. Without
      // one of the two declarations the app warns at startup, because rate
      // limiting then treats every caller the same.
      TRUST_FORWARDED_HEADER: "true",
    },
  );

  browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: APP_URL });
  const page = await context.newPage();

  // ---- sign in -------------------------------------------------------------
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(DEMO_EMAIL);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${APP_URL}/`);
  await page.waitForSelector('h1:text-is("Dashboard")', { timeout: 20_000 });
  const dashboard = await text(page);
  check("a signed-in person lands on the dashboard", dashboard.includes("Dashboard"), page.url());
  check(
    "the dashboard no longer exposes the canonical user id",
    !dashboard.includes("app_user.id"),
  );

  // ---- the interface language is a stored preference -----------------------
  //
  // Switching writes two places, and both are asserted here: the cookie, which
  // renders the very next request, and `app_user.locale`, which owns the language
  // of mail sent later from a background task. A regression in either is invisible
  // until someone is reading a language they did not choose.
  await page.goto("/account");
  await page.locator('select[name="locale"]').selectOption("zh-CN");
  await page.waitForFunction(() => document.documentElement.lang === "zh-CN", null, { timeout: 20_000 });
  const chineseAccount = await text(page);
  check(
    "switching to Chinese re-renders the interface in Chinese",
    chineseAccount.includes("账户") && !chineseAccount.includes("Sign out"),
    JSON.stringify(chineseAccount.slice(0, 80)),
  );
  check(
    "the chosen language is stored on the account",
    (await storedLocale()) === "zh-CN",
  );

  // Back to English, so the rest of the journey — and the demo account — are left
  // exactly as this run found them.
  await page.locator('select[name="locale"]').selectOption("en");
  await page.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 20_000 });
  check("switching back re-renders in English", (await text(page)).includes("Sign out"));
  check("the change back is stored on the account", (await storedLocale()) === "en");

  // Return to the dashboard: the rest of the journey starts there, and leaving
  // the page on /account would make it fail for a reason this block caused.
  await page.goto("/");
  await page.waitForSelector('h1:text-is("Dashboard")', { timeout: 20_000 });

  // ---- start a routine through the Workout destination --------------------
  await page.goto("/workout");
  await page.getByRole("button", { name: "Start Leg Day", exact: true }).click();
  await page.waitForURL(/\/workouts\/[0-9a-f-]{36}$/);
  await page.getByRole("heading", { name: "Squat (Barbell)", exact: true }).waitFor();
  const workoutUrl = page.url();
  const workoutId = workoutUrl.split("/").pop() ?? "";
  check("starting a routine opens its full-screen logger", await page.getByRole("navigation").count() === 0, workoutUrl);
  const originalViewport = page.viewportSize();
  await page.getByRole("button", { name: /Add exercise/i }).click();
  await page.setViewportSize({ width: 390, height: 420 });
  const picker = page.getByRole("dialog", { name: "Add exercise", exact: true });
  await picker.getByRole("searchbox").fill("crunch");
  await picker.getByRole("button", { name: "Select Crunch", exact: true }).click();
  await picker.getByRole("searchbox").fill("plank");
  await page.waitForFunction(() => {
    const first = document.querySelector('[role="dialog"] button[aria-label="Select Plank"]');
    if (!first) return false;
    const rect = first.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit !== null && first.contains(hit);
  }, undefined, { timeout: 5000 });
  check("filtering exposes the first result without losing the previous selection",
    (await picker.innerText()).includes("1 selected"));
  await picker.getByRole("button", { name: "Select Plank", exact: true }).click();
  await picker.getByRole("button", { name: "Add 2 exercises", exact: true }).click();
  await page.getByRole("heading", { name: "Plank", exact: true }).waitFor();
  if (originalViewport) await page.setViewportSize(originalViewport);
  const squat = page.locator("li").filter({ has: page.getByRole("heading", { name: "Squat (Barbell)", exact: true }) }).first();
  const firstSet = squat.getByRole("group", { name: "Set 1", exact: true });
  await firstSet.getByRole("textbox", { name: "Reps", exact: true }).fill(WORKING_REPS);
  await firstSet.getByRole("textbox", { name: "kg", exact: true }).fill(WORKING_WEIGHT);
  await firstSet.getByRole("button", { name: "Complete set", exact: true }).click();
  check("a completed row has an explicit pressed checkmark",
    await firstSet.getByRole("button", { name: "Undo completed set", exact: true }).getAttribute("aria-pressed") === "true");

  const persistedSets = async () => (await localeClient!.query<{
    position: number; reps: number | null; weight_kg: string | null; set_type: string; completed_at: Date | null;
  }>(`select ws.position, ws.reps, ws.weight_kg, ws.set_type, ws.completed_at
      from workout_set ws join workout_exercise we on we.id = ws.workout_exercise_id
      where we.workout_id = $1 and we.position = 0 order by ws.position`, [workoutId])).rows;
  await page.waitForFunction(() => document.body.innerText.includes("All changes saved"), undefined, { timeout: 30_000 });
  check("logged values and completion reach the server", (await persistedSets()).some((set) =>
    set.completed_at !== null && Number(set.weight_kg) === Number(WORKING_WEIGHT) && set.reps === Number(WORKING_REPS)));

  // A clean browser without this IndexedDB must see the same completed values.
  const probeContext = await browser.newContext({ baseURL: APP_URL });
  await probeContext.addCookies(await context.cookies());
  const probePage = await probeContext.newPage();
  const probeErrors: string[] = [];
  probePage.on("pageerror", (error) => probeErrors.push(error.message));
  await probePage.route(workoutUrl, async (route) => {
    if (!route.request().isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    // Preserve the real server response, but deliver it after the clock ticks.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ response });
  });
  await probePage.goto(workoutUrl);
  const serverSet = probePage.getByRole("group", { name: "Set 1", exact: true }).first();
  await serverSet.getByRole("button", { name: "Undo completed set", exact: true }).waitFor();
  check("another browser reads the actual saved set",
    Number(await serverSet.getByRole("textbox", { name: "kg", exact: true }).inputValue()) === Number(WORKING_WEIGHT));
  await probePage.waitForFunction(() => /^\d+:\d{2}(?::\d{2})?$/.test(
    document.querySelector("[data-active-logger] header dd")?.textContent ?? "",
  ));
  check("a slow first load hydrates a live elapsed timer without resetting the logger",
    probeErrors.length === 0 && await serverSet.getByRole("button", { name: "Undo completed set", exact: true }).isVisible(),
    probeErrors.join("; "));
  await probeContext.close();

  // Rest identity/adjustment must survive the logger's initial hydration.
  await page.getByRole("timer").waitFor();
  await page.getByRole("button", { name: "Add 15 seconds of rest", exact: true }).click();
  const restDeadline = () => page.evaluate((id) => {
    const key = Object.keys(sessionStorage).find((name) => name.startsWith("forte:rest:v1:") && name.endsWith(`:${id}`));
    const state: unknown = key ? JSON.parse(sessionStorage.getItem(key)!) : null;
    if (!state || typeof state !== "object" || !("current" in state)) return null;
    const current = state.current;
    return current && typeof current === "object" && "deadline" in current && typeof current.deadline === "number" ? current.deadline : null;
  }, workoutId);
  const adjustedDeadline = await restDeadline();
  await page.reload();
  await page.getByRole("timer").waitFor();
  check("adjusted rest survives draft hydration and reload", adjustedDeadline != null && await restDeadline() === adjustedDeadline);
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.reload();
  await firstSet.getByRole("button", { name: "Undo completed set", exact: true }).waitFor();
  await page.waitForFunction(() => {
    const finish = document.querySelector("[data-active-logger] header button");
    return finish instanceof HTMLButtonElement && !finish.disabled;
  });
  check("skipped rest does not restart after reload", await page.getByRole("timer").count() === 0);

  // Wait for the exact route and its assets to be retained before losing signal.
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, { timeout: 30_000 });
  await page.waitForFunction(async (url) => {
    for (const name of (await caches.keys()).filter((entry) => entry.startsWith("forte-private-"))) {
      if (await (await caches.open(name)).match(url)) return true;
    }
    return false;
  }, workoutUrl, { timeout: 30_000 });

  // ---- offline: change type and values, then recover the same draft --------
  await context.setOffline(true);
  const secondSet = squat.getByRole("group", { name: "Set 2", exact: true });
  await secondSet.getByRole("button", { name: "Set type: Normal", exact: true }).click();
  await page.getByRole("dialog", { name: "Set type", exact: true }).getByRole("button", { name: "Failure", exact: true }).click();
  await secondSet.getByRole("textbox", { name: "Reps", exact: true }).fill(WORKING_REPS);
  await secondSet.getByRole("textbox", { name: "kg", exact: true }).fill(WORKING_WEIGHT);
  await secondSet.getByRole("button", { name: "Complete set", exact: true }).click();
  // Completion paints optimistically; the disabled check is the durable-write
  // affordance. Reload after it settles, not while IndexedDB is committing.
  await secondSet.getByRole("button", { name: "Undo completed set", exact: true }).and(page.locator(":enabled")).waitFor();
  check("offline completion is explicitly checked", true);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await secondSet.getByRole("button", { name: "Undo completed set", exact: true }).waitFor({ timeout: 30_000 });
  check("offline reload restores the edited local set and type",
    Number(await secondSet.getByRole("textbox", { name: "kg", exact: true }).inputValue()) === Number(WORKING_WEIGHT) &&
    await secondSet.getByRole("button", { name: "Set type: Failure", exact: true }).count() === 1);
  check("the worker serves the exact logger offline", page.url() === workoutUrl && (await text(page)).includes("Leg Day"));

  await context.setOffline(false);
  await page.waitForFunction(() => document.body.innerText.includes("All changes saved"), undefined, { timeout: 30_000 });
  const restoredSets = await persistedSets();
  check("offline edits automatically reconcile when connectivity returns",
    restoredSets.filter((set) => set.completed_at != null && Number(set.weight_kg) === Number(WORKING_WEIGHT) && set.reps === Number(WORKING_REPS)).length === 2 &&
    restoredSets[1].set_type === "failure");

  // ---- review makes unchecked-set policy explicit; Save commits once -------
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review workout", exact: true });
  await review.getByRole("button", { name: "Save workout", exact: true }).waitFor();
  check("Finish reviews checked sets without auto-completing the rest",
    (await review.innerText()).includes("unchecked") && (await persistedSets()).filter((set) => set.completed_at != null).length === 2);
  await review.getByRole("button", { name: "Keep logging", exact: true }).click();
  check("review can return to editing", await firstSet.getByRole("button", { name: "Undo completed set", exact: true }).isVisible());
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await review.getByRole("button", { name: "Save workout", exact: true }).click();
  await page.getByText("Saved to your workout history", { exact: true }).waitFor({ timeout: 30_000 });
  check("Save opens the read-only completed recap", await page.getByRole("button", { name: "Finish", exact: true }).count() === 0);
  check("finishing persists the end timestamp", (await localeClient!.query("select ended_at from workout where id=$1", [workoutId])).rows[0]?.ended_at != null);

  // ---- history and the record ---------------------------------------------
  await page.goto(`/workouts/${workoutId}`);
  await page.waitForSelector("text=Duration", { timeout: 20_000 });
  const detail = await text(page);
  check(
    "the finished workout shows the record it earned",
    detail.includes("Heaviest weight"),
    `url=${page.url()} text=${JSON.stringify(detail.slice(0, 140))}`,
  );

  await page.goto("/workouts");
  // The seeded history already contains Leg Day workouts, so the assertion names
  // this run's workout rather than its title.
  const inHistory = await page
    .waitForSelector(`a[href="/workouts/${workoutId}"]`, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  check(
    "the workout is in history",
    inHistory,
    `cards=${await page.locator("a[href^='/workouts/']").count()}`,
  );

  // ---- sign out, and prove the local data is that account's alone ----------
  await page.goto("/account");
  // The account page also lists sessions, each with its own sign-out control;
  // this is the section's, not a single session's revocation.
  await page
    .locator("section", { has: page.getByRole("heading", { name: "Sign out", exact: true }) })
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await page.waitForURL(/\/sign-in/);

  const leftover = await page.evaluate(async () => {
    // The worker's private cache and the IndexedDB document are the two places an
    // account's workout can outlive its session. Both are asserted empty.
    const countOfflineRecords = () => {
      const { promise, resolve } = Promise.withResolvers<number>();
      const open = indexedDB.open("forte-offline");
      open.onerror = () => resolve(0);
      open.onsuccess = () => {
        const db = open.result;
        const names = Array.from(db.objectStoreNames);
        if (names.length === 0) {
          resolve(0);
          return;
        }
        const tx = db.transaction(names, "readonly");
        let total = 0;
        let pending = names.length;
        const settle = () => {
          if (--pending === 0) resolve(total);
        };
        for (const name of names) {
          const request = tx.objectStore(name).count();
          request.onsuccess = () => {
            total += request.result;
            settle();
          };
          request.onerror = settle;
        }
      };
      return promise;
    };

    const stores = await countOfflineRecords();
    const cacheNames = await caches.keys();
    const privateCaches = cacheNames.filter((name) => name.startsWith("forte-private-"));
    let cachedRoutes = 0;
    for (const name of privateCaches) {
      cachedRoutes += (await (await caches.open(name)).keys()).length;
    }
    return { stores, cachedRoutes };
  });
  check(
    "signing out purges the local workout document",
    leftover.stores === 0,
    `records=${leftover.stores}`,
  );
  check(
    "signing out purges the worker's private route snapshot",
    leftover.cachedRoutes === 0,
    `routes=${leftover.cachedRoutes}`,
  );

  // ---- a second account sees none of it -----------------------------------
  await page.goto("/sign-up");
  await page.locator('input[name="email"]').fill(SECOND_EMAIL);
  await page.locator('input[name="password"]').fill(SECOND_PASSWORD);
  const name = page.locator('input[name="name"]');
  if (await name.count()) await name.fill("Verify Browser");
  await page.getByRole("button", { name: /create account|sign up/i }).click();
  await page.waitForURL(`${APP_URL}/`, { timeout: 30_000 });
  await page.waitForSelector('h1:text-is("Dashboard")', { timeout: 20_000 });
  const secondUser = await text(page);
  check(
    "a second account starts with no workout of its own",
    (await page.locator('a[href^="/workouts/"]').count()) === 0,
    `url=${page.url()} text=${JSON.stringify(secondUser.slice(0, 140))}`,
  );
  check(
    "the second account cannot see the first account's workout",
    !secondUser.includes("Leg Day"),
  );
} finally {
  await browser?.close();
  server?.kill();
  await localeClient?.end().catch(() => {});
  if (pg) {
    await pg.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
  if (admin) {
    try {
      if (externalDatabaseCreated) {
        await admin.query(`drop database ${externalDatabaseName} with (force)`);
      }
    } finally {
      await admin.end();
    }
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
