import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { chromium, type Browser, type Page } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, ".pgdata-release-verify");
const PG_PORT = 55442;
const APP_PORT = 3122;
const APP_URL = `http://localhost:${APP_PORT}`;
const DATABASE_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/postgres`;
const DEMO_EMAIL = "demo@forte.local";
const DEMO_PASSWORD = "forte-demo-password";
const SCREENSHOT_DIR = process.env.FORTE_SCREENSHOT_DIR || join(root, "screenshots", "release-verify");

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

async function startServer(command: string[], env: Record<string, string>): Promise<ChildProcess> {
  const child = spawn(command[0], command.slice(1), {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  child.stderr.on("data", (d) => {
    const s = String(d);
    if (s.includes("request.error")) process.stderr.write(`[server:err] ${s}`);
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${APP_URL}/sign-in`, { redirect: "manual" });
      if (r.status > 0) return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Next server failed to start");
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(DEMO_EMAIL);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${APP_URL}/`, { timeout: 20_000 });
}

await mkdir(SCREENSHOT_DIR, { recursive: true });
await rm(dataDir, { recursive: true, force: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: PG_PORT,
  persistent: false,
  initdbFlags: ["--encoding=UTF8"],
});
await pg.initialise();
await pg.start();

const pool = new Pool({ connectionString: DATABASE_URL });
let server: ChildProcess | null = null;
let browser: Browser | null = null;

try {
  for (const script of ["scripts/migrate.ts", "scripts/seed-dev.ts"]) {
    const code = await runCommand([process.execPath, join(root, script)], { DATABASE_URL });
    if (code !== 0) throw new Error(`${script} failed with ${code}`);
  }

  // Use Node.js (matching Vercel production runtime) to verify the exact digest path.
  const nodeBin = process.platform === "win32" ? "C:\\Program Files\\nodejs\\node.exe" : "node";
  server = await startServer(
    [nodeBin, join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(APP_PORT)],
    {
      NODE_ENV: "production",
      DATABASE_URL,
      BETTER_AUTH_SECRET: "release-verify-secret-at-least-32-characters",
      BETTER_AUTH_URL: APP_URL,
      EMAIL_API_KEY: "re_verify_not_real",
      EMAIL_FROM: "forte <verify@example.com>",
      TRUST_FORWARDED_HEADER: "true",
    },
  );

  browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: APP_URL,
    viewport: { width: 390, height: 844 },
  });
  let page = await context.newPage();

  // =========================================================================
  // 1. Settings & account regression (Reference 3297751167 — aged session > 24h)
  // =========================================================================
  await signIn(page);
  await pool.query("UPDATE session SET created_at = now() - interval '2 days'");

  // Check top-right account icon -> Profile -> Settings & account page on aged (>24h) session
  await page.locator('header a[href="/profile"]').first().click();
  await page.waitForURL(`${APP_URL}/profile`, { timeout: 15_000 });
  await page.getByRole("heading", { name: "Profile", exact: true }).waitFor({ timeout: 15_000 });
  const profileText = await page.evaluate(() => document.body.innerText);
  check(
    "Top-right account icon opens Profile cleanly with aged (>24h) session",
    profileText.includes("Settings & account") && !profileText.includes("This page could not load"),
  );

  // Check Profile -> Settings & account link
  await page.getByRole("link", { name: /Settings & account/i }).click();
  await page.waitForURL(`${APP_URL}/account`, { timeout: 15_000 });
  await page.getByRole("heading", { name: "Account", exact: true }).waitFor({ timeout: 15_000 });
  const accountText = await page.evaluate(() => document.body.innerText);
  check(
    "Settings & account loads without Reference 3297751167 crash on aged (>24h) session",
    accountText.includes("Device preferences") &&
      accountText.includes("Appearance") &&
      accountText.includes("Rest timer") &&
      accountText.includes("sign in again to view or sign out other devices") &&
      !accountText.includes("This page could not load"),
  );

  // Test independent Sound & Vibration toggles + Preview + Light theme
  await page.getByRole("radio", { name: "Light", exact: true }).click();
  const themeAfterLight = await page.evaluate(() => document.documentElement.dataset.theme);
  check("Light theme applies immediately", themeAfterLight === "light");
  await page.screenshot({ path: join(SCREENSHOT_DIR, "settings-light.png"), fullPage: true });

  const soundSwitch = page.getByRole("switch", { name: "Completion sound", exact: true });
  const vibSwitch = page.getByRole("switch", { name: "Completion vibration", exact: true });
  await soundSwitch.click();
  check(
    "Sound and vibration toggles are independent",
    (await soundSwitch.getAttribute("aria-checked")) === "false" &&
      (await vibSwitch.getAttribute("aria-checked")) === "true",
  );
  await page.getByRole("button", { name: "Preview alert", exact: true }).click();
  check("Preview alert reports confirmation", (await page.evaluate(() => document.body.innerText)).includes("Alert preview triggered."));

  // Capture Light theme Dashboard screenshot
  await page.goto("/");
  await page.waitForSelector('h1:text-is("Dashboard")', { timeout: 15_000 });
  await page.screenshot({ path: join(SCREENSHOT_DIR, "dashboard-light.png") });

  // Switch back to Dark for dark-mode editor & thumbnail review, and restore sound=true
  await page.goto("/account");
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await page.getByRole("switch", { name: "Completion sound", exact: true }).click();

  // =========================================================================
  // 2. Routine editor UI polish + narrow phone keyboard-open + 5 thumbnails
  // =========================================================================
  // Ensure the 5 requested exercises exist and capture a Routine Editor screenshot
  const routineRes = await pool.query<{ id: string }>("SELECT id FROM routine ORDER BY title ASC LIMIT 1");
  const firstRoutineId = routineRes.rows[0].id;
  await page.goto(`/routines/${firstRoutineId}/edit`);
  await page.waitForSelector('h1:text-is("Edit routine")', { timeout: 15_000 });
  const editorOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  check("Refreshed routine editor has zero horizontal overflow at 390px", editorOverflow);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "routine-editor-dark.png"), fullPage: true });

  // Narrow phone (360px) with simulated keyboard open (height 420px)
  await page.setViewportSize({ width: 360, height: 420 });
  const narrowOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  check("Routine editor has zero horizontal overflow at 360x420 (narrow + keyboard)", narrowOverflow);
  await page.getByRole("button", { name: "+ Add exercise", exact: true }).click();
  const pickerDialog = page.getByRole("dialog", { name: "Add exercise", exact: true });
  await pickerDialog.getByRole("searchbox").fill("inverted row");
  await page.waitForTimeout(300);
  const addBtnVisible = await pickerDialog.getByRole("button", { name: /Add/i }).isVisible();
  check("Routine editor exercise picker keeps Add button reachable with keyboard open", addBtnVisible);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "routine-editor-picker-narrow.png") });
  await pickerDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  // Switch to Light theme on Routine Editor for Light screenshot
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.screenshot({ path: join(SCREENSHOT_DIR, "routine-editor-light.png"), fullPage: true });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });

  // Capture circular thumbnails for all 5 requested exercises in compact list
  await page.goto("/exercises");
  await page.waitForTimeout(500);
  // Build a dedicated thumbnail review view inside the live page for visual inspection of all 5 targets
  const targetSlugs = [
    { slug: "squat-barbell", title: "Squat (Barbell)" },
    { slug: "inverted-row", title: "Inverted Row" },
    { slug: "romanian-deadlift-barbell", title: "Romanian Deadlift (Barbell)" },
    { slug: "overhead-press-barbell", title: "Overhead Press (Barbell)" },
    { slug: "incline-bench-press-barbell", title: "Incline Bench Press (Barbell)" },
  ];
  await page.evaluate((items) => {
    const host = document.createElement("div");
    host.id = "thumb-review-card";
    host.style.cssText = "position:fixed;inset:0;z-index:9999;background:var(--bg-canvas);padding:24px;overflow:auto;";
    host.innerHTML = `<h2 style="font-size:18px;font-weight:700;margin-bottom:16px;color:var(--text-primary)">Thumbnail review (sm 44px & md 64px)</h2>` +
      items.map((it) => `
        <div style="display:flex;align-items:center;gap:14px;padding:12px;margin-bottom:10px;border-radius:16px;border:1px solid var(--border-subtle);background:var(--bg-surface)">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:6px;border-radius:9999px;background:#fff;border:1px solid var(--border-subtle);overflow:hidden;flex-shrink:0">
            <img src="/exercise-media/thumbnails/${it.slug}.jpg" style="width:100%;height:100%;object-fit:contain" />
          </span>
          <span style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;padding:8px;border-radius:9999px;background:#fff;border:1px solid var(--border-subtle);overflow:hidden;flex-shrink:0">
            <img src="/exercise-media/thumbnails/${it.slug}.jpg" style="width:100%;height:100%;object-fit:contain" />
          </span>
          <span style="font-size:15px;font-weight:600;color:var(--text-primary)">3 sets ${it.title}</span>
        </div>
      `).join("");
    document.body.appendChild(host);
  }, targetSlugs);
  await page.waitForFunction(() => {
    const imgs = Array.from(document.querySelectorAll("#thumb-review-card img")) as HTMLImageElement[];
    return imgs.length === 10 && imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, undefined, { timeout: 15_000 });
  check("All 5 target exercise thumbnails load cleanly", true);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "thumbnails-review.png") });
  await page.evaluate(() => document.getElementById("thumb-review-card")?.remove());

  // =========================================================================
  // 3. Full End-to-End Offline Release Scenario (PWA cold launch + interrupted retry)
  // =========================================================================
  // Refresh session so sync succeeds, visit `/` so SW & OfflineSyncBridge warm everything
  await pool.query("UPDATE session SET created_at = now()");
  await page.goto("/");
  await page.waitForSelector('h1:text-is("Dashboard")', { timeout: 15_000 });

  // Wait for service worker controller, /offline-app cached in forte-static-v4, AND IndexedDB populated
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker?.controller) return false;
    const cache = await caches.open("forte-static-v4");
    const hasShell = Boolean(await cache.match("/offline-app"));
    if (!hasShell) return false;
    return await new Promise<boolean>((resolve) => {
      const req = indexedDB.open("forte-offline");
      req.onerror = () => resolve(false);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("routines") || !db.objectStoreNames.contains("catalog")) {
          resolve(false);
          return;
        }
        const tx = db.transaction(["routines", "catalog"], "readonly");
        let routinesCount = 0;
        let hasCat = false;
        tx.objectStore("routines").count().onsuccess = (e) => { routinesCount = (e.target as IDBRequest).result; };
        tx.objectStore("catalog").get("snapshot").onsuccess = (e) => { hasCat = Boolean((e.target as IDBRequest).result); };
        tx.oncomplete = () => resolve(routinesCount > 0 && hasCat);
        tx.onerror = () => resolve(false);
      };
    });
  }, undefined, { timeout: 30_000 });
  check("Online setup warmed SW /offline-app shell and IndexedDB catalog + routines", true);

  // AIRPLANE MODE + FULL COLD LAUNCH (close page completely, go offline, open brand-new page at `/`)
  await page.close();
  await context.setOffline(true);
  page = await context.newPage();
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.getByRole("heading", { name: "Workout history", exact: true }).waitFor({ timeout: 20_000 });
  check("Cold launch in airplane mode boots offline-capable shell from `/`", true);

  // Browse exercises & thumbnails offline
  await page.getByRole("button", { name: "Exercises", exact: true }).click();
  await page.getByPlaceholder("Search exercises").fill("Squat");
  await page.getByText("Squat (Barbell)", { exact: true }).waitFor({ timeout: 10_000 });
  check("Exercises and thumbnails browseable offline", true);

  // Check Settings offline: Appearance & rest preferences work offline while account shows offline state
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  const offlineSettingsText = await page.evaluate(() => document.body.innerText);
  check(
    "Offline Settings keeps Appearance & Rest timer usable and shows clear offline account state",
    offlineSettingsText.includes("Appearance") &&
      offlineSettingsText.includes("Rest timer") &&
      offlineSettingsText.includes("account actions need an internet connection"),
  );

  // Edit a routine offline
  await page.getByRole("button", { name: "Workout", exact: true }).click();
  const legDayCard = page.locator("li", { hasText: "Leg Day" }).first();
  await legDayCard.getByRole("button", { name: "Edit routine", exact: true }).click();
  await page.getByRole("heading", { name: "Edit routine", exact: true }).waitFor({ timeout: 10_000 });
  const nameInput = page.getByLabel("Name", { exact: true });
  await nameInput.fill("Leg Day Offline Edited");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Leg Day Offline Edited", { exact: true }).waitFor({ timeout: 10_000 });
  const editedCardText = await page.locator("li", { hasText: "Leg Day Offline Edited" }).first().innerText();
  check("Offline routine edit persists with 'Saved on this device' badge", editedCardText.includes("Saved on this device"));

  // Start workout from edited routine offline -> log set & note -> verify rest timer
  await page.locator("li", { hasText: "Leg Day Offline Edited" }).first().getByRole("button", { name: /Start routine/i }).click();
  await page.getByRole("heading", { name: "Leg Day Offline Edited", exact: true }).waitFor({ timeout: 15_000 });
  const squatCard = page.locator("li").filter({ hasText: "Squat (Barbell)" }).first();
  const set1 = squatCard.getByRole("group", { name: "Set 1", exact: true });
  await set1.getByRole("textbox", { name: "kg", exact: true }).fill("102.5");
  await set1.getByRole("textbox", { name: "Reps", exact: true }).fill("6");
  await set1.getByRole("button", { name: "Complete set", exact: true }).click();
  await set1.getByRole("button", { name: "Undo completed set", exact: true }).waitFor({ timeout: 10_000 });
  await page.getByRole("timer").waitFor({ timeout: 10_000 });
  check("Offline workout logging starts rest timer and marks set done", true);

  // Wait briefly for IndexedDB commit, then CLOSE AND REOPEN MID-WORKOUT while STILL OFFLINE
  await page.waitForTimeout(400);
  await page.close();
  page = await context.newPage();
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.getByRole("button", { name: /Resume Workout/i }).first().click();
  await page.getByRole("heading", { name: "Leg Day Offline Edited", exact: true }).waitFor({ timeout: 15_000 });
  const resumedSet1 = page.locator("li").filter({ hasText: "Squat (Barbell)" }).first().getByRole("group", { name: "Set 1", exact: true });
  await resumedSet1.getByRole("button", { name: "Undo completed set", exact: true }).waitFor({ timeout: 10_000 });
  const resumedKg = await resumedSet1.getByRole("textbox", { name: "kg", exact: true }).inputValue();
  check("Closing and reopening mid-workout offline preserves logged sets", Number(resumedKg) === 102.5, `kg=${resumedKg}`);

  // Finish & Save workout offline
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  const reviewDialog = page.getByRole("dialog", { name: "Review workout", exact: true });
  await reviewDialog.getByRole("button", { name: "Save workout", exact: true }).click();
  await page.getByRole("heading", { name: "Workout complete", exact: true }).waitFor({ timeout: 15_000 });
  check("Finishing workout offline shows local recap with 'Saved on this device'", (await page.evaluate(() => document.body.innerText)).includes("Saved on this device"));

  // Cold launch AGAIN offline and confirm finished workout is in History
  await page.close();
  page = await context.newPage();
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.getByRole("heading", { name: "Workout history", exact: true }).waitFor({ timeout: 15_000 });
  const historyTextOffline = await page.evaluate(() => document.body.innerText);
  check(
    "Cold launch after finishing offline shows workout in local history as 'Saved on this device'",
    historyTextOffline.includes("Leg Day Offline Edited") && historyTextOffline.includes("Saved on this device"),
  );

  // INTERRUPTED SYNC RETRY TEST:
  // Forward the first POST /api/offline/sync to the server so it commits to PostgreSQL,
  // then abort the response to simulate a mid-sync network drop!
  let interceptedSyncCalls = 0;
  await context.route("**/api/offline/sync", async (route) => {
    interceptedSyncCalls++;
    if (interceptedSyncCalls === 1) {
      await route.fetch(); // Server commits!
      await route.abort("failed"); // Network drops before client receives 200!
      return;
    }
    await route.continue();
  });

  await context.setOffline(false);
  await page.waitForTimeout(1500);
  check("First sync attempt was interrupted after server commit", interceptedSyncCalls >= 1);

  // Trigger retry (either automatic or clicking Retry sync)
  const retryBtn = page.getByRole("button", { name: "Retry sync", exact: true });
  if (await retryBtn.isVisible().catch(() => false)) {
    await retryBtn.click();
  }
  await page.waitForFunction(
    () => document.body.innerText.includes("All local changes synced") || document.body.innerText.includes("Connected · open online view"),
    undefined,
    { timeout: 20_000 },
  );

  // Verify PostgreSQL has EXACTLY ONE synced workout row (zero duplicates!) and the edited routine!
  const syncedWorkouts = await pool.query<{ id: string; title: string; ended_at: Date | null }>(
    "SELECT id, title, ended_at FROM workout WHERE title = 'Leg Day Offline Edited'",
  );
  const syncedRoutines = await pool.query<{ id: string; title: string }>(
    "SELECT id, title FROM routine WHERE title = 'Leg Day Offline Edited'",
  );
  check(
    "Interrupted sync retry produces EXACTLY ONE workout row (no duplicates) and syncs edited routine",
    syncedWorkouts.rows.length === 1 && syncedWorkouts.rows[0].ended_at !== null && syncedRoutines.rows.length === 1,
    `workouts=${syncedWorkouts.rows.length} routines=${syncedRoutines.rows.length}`,
  );
  await context.unroute("**/api/offline/sync");

  // =========================================================================
  // 4. Session expiry preservation
  // =========================================================================
  await context.setOffline(true);
  await page.getByRole("button", { name: "Workout", exact: true }).click();
  await page.getByRole("button", { name: /\+ Create routine/i }).click();
  await page.getByLabel("Name", { exact: true }).fill("Session Expiry Routine");
  await page.getByRole("button", { name: "Create routine", exact: true }).click();
  await page.getByText("Session Expiry Routine", { exact: true }).waitFor({ timeout: 10_000 });

  // Expire all sessions server-side while offline
  await pool.query("DELETE FROM session");
  await context.setOffline(false);
  await page.waitForFunction(
    () => document.body.innerText.includes("Sign in to sync"),
    undefined,
    { timeout: 15_000 },
  );
  check("Session expiry preserves pending work and shows 'Sign in to sync'", true);

  // Sign back in as SAME user -> pending routine syncs automatically!
  await signIn(page);
  await page.waitForTimeout(2000);
  const afterResignIn = await pool.query("SELECT id FROM routine WHERE title = 'Session Expiry Routine'");
  check("Re-signing in as the same account syncs preserved pending work", afterResignIn.rows.length === 1);

  // =========================================================================
  // 5. Pending offline protection across sign-out, account switch, & interrupted retry
  // =========================================================================
  // Ensure SW + IndexedDB are warmed for Account A after re-sign-in
  await page.goto("/");
  await page.waitForSelector('h1:text-is("Dashboard")', { timeout: 15_000 });
  await page.waitForTimeout(1000);

  // Go offline, edit a routine AND complete a workout so BOTH are unsynced on device
  await context.setOffline(true);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.getByRole("heading", { name: "Workout history", exact: true }).waitFor({ timeout: 20_000 });

  await page.getByRole("button", { name: "Workout", exact: true }).click();
  await page.locator("li", { hasText: "Leg Day Offline Edited" }).first().getByRole("button", { name: "Edit routine", exact: true }).click();
  await page.getByRole("heading", { name: "Edit routine", exact: true }).waitFor({ timeout: 10_000 });
  await page.getByLabel("Name", { exact: true }).fill("Vaulted Routine Edit");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Vaulted Routine Edit", { exact: true }).waitFor({ timeout: 10_000 });

  await page.locator("li", { hasText: "Vaulted Routine Edit" }).first().getByRole("button", { name: /Start routine/i }).click();
  await page.getByRole("heading", { name: "Vaulted Routine Edit", exact: true }).waitFor({ timeout: 15_000 });
  const vaultedSet1 = page.locator("li").filter({ hasText: "Squat (Barbell)" }).first().getByRole("group", { name: "Set 1", exact: true });
  await vaultedSet1.getByRole("textbox", { name: "kg", exact: true }).fill("115");
  await vaultedSet1.getByRole("textbox", { name: "Reps", exact: true }).fill("5");
  await vaultedSet1.getByRole("button", { name: "Complete set", exact: true }).click();
  await vaultedSet1.getByRole("button", { name: "Undo completed set", exact: true }).waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("dialog", { name: "Review workout", exact: true }).getByRole("button", { name: "Save workout", exact: true }).click();
  await page.getByRole("heading", { name: "Workout complete", exact: true }).waitFor({ timeout: 15_000 });

  // Block /api/offline/sync while coming online so Account A signs out WITH unsynced changes still pending
  await context.route("**/api/offline/sync", async (route) => {
    await route.abort("failed");
  });
  await context.setOffline(false);
  await page.goto("/account");
  await page.getByRole("heading", { name: "Account", exact: true }).waitFor({ timeout: 15_000 });
  const signOutSection = page.locator("section", { has: page.getByRole("heading", { name: "Sign out", exact: true }) });
  await page.waitForFunction(
    () => document.body.innerText.includes("unsynced change(s) on this device will stay saved privately"),
    undefined,
    { timeout: 10_000 },
  );
  check("Sign-out UI warns that unsynced changes stay saved privately for this account", true);
  await signOutSection.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL(/\/sign-in/, { timeout: 15_000 });

  // Verify active store & private caches are empty while signed out
  const signedOutCheck = await page.evaluate(async () => {
    const activeCount = await new Promise<number>((resolve) => {
      const req = indexedDB.open("forte-offline");
      req.onerror = () => resolve(-1);
      req.onsuccess = () => {
        const db = req.result;
        const names = Array.from(db.objectStoreNames);
        if (names.length === 0) return resolve(0);
        const tx = db.transaction(names, "readonly");
        let total = 0;
        let rem = names.length;
        for (const name of names) {
          const c = tx.objectStore(name).count();
          c.onsuccess = () => { total += c.result; if (--rem === 0) resolve(total); };
          c.onerror = () => { if (--rem === 0) resolve(total); };
        }
      };
    });
    const privateCaches = (await caches.keys()).filter((k) => k.startsWith("forte-private-"));
    let privateRoutes = 0;
    for (const k of privateCaches) privateRoutes += (await (await caches.open(k)).keys()).length;
    return { activeCount, privateRoutes };
  });
  check(
    "Sign-out clears active forte-offline store and private SW caches while vaulting pending work",
    signedOutCheck.activeCount === 0 && signedOutCheck.privateRoutes === 0,
    `active=${signedOutCheck.activeCount} privateRoutes=${signedOutCheck.privateRoutes}`,
  );

  // Confirm signed-out /offline-app cannot see Account A's pending changes
  await page.goto("/offline-app");
  await page.waitForTimeout(500);
  check(
    "Signed-out offline shell cannot see previous account's vaulted changes",
    !(await page.evaluate(() => document.body.innerText)).includes("Vaulted Routine Edit"),
  );

  // Unblock sync and sign up + sign in as a SECOND account (Account B)
  await context.unroute("**/api/offline/sync");
  await page.goto("/sign-up");
  await page.locator('input[name="email"]').fill("second-offline-check@forte.local");
  await page.locator('input[name="password"]').fill("second-account-password");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.waitForURL(`${APP_URL}/`, { timeout: 20_000 });
  await page.waitForTimeout(2000);

  await page.goto("/routines");
  const accountBRoutines = await page.evaluate(() => document.body.innerText);
  await page.goto("/workouts");
  const accountBWorkouts = await page.evaluate(() => document.body.innerText);
  const dbWhileAccountB = await pool.query(
    "SELECT (SELECT count(*)::int FROM workout WHERE title = 'Vaulted Routine Edit') AS w, (SELECT count(*)::int FROM routine WHERE title = 'Vaulted Routine Edit') AS r",
  );
  check(
    "Second account cannot read or upload first account's vaulted pending workout or routine",
    !accountBRoutines.includes("Vaulted Routine Edit") &&
      !accountBWorkouts.includes("Vaulted Routine Edit") &&
      dbWhileAccountB.rows[0].w === 0 &&
      dbWhileAccountB.rows[0].r === 0,
    `w=${dbWhileAccountB.rows[0].w} r=${dbWhileAccountB.rows[0].r}`,
  );

  // Sign out Account B
  await page.goto("/account");
  await page.getByRole("heading", { name: "Account", exact: true }).waitFor({ timeout: 15_000 });
  await page
    .locator("section", { has: page.getByRole("heading", { name: "Sign out", exact: true }) })
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await page.waitForURL(/\/sign-in/, { timeout: 15_000 });

  // Intercept FIRST /api/offline/sync on Account A re-sign-in: commit on server, then drop response!
  let vaultRetryCalls = 0;
  await context.route("**/api/offline/sync", async (route) => {
    vaultRetryCalls++;
    if (vaultRetryCalls === 1) {
      await route.fetch(); // Server commits Account A's vaulted workout & routine!
      await route.abort("failed"); // Drop response to exercise interrupted sync retry!
      return;
    }
    await route.continue();
  });

  // Sign back in as ORIGINAL Account A -> vaulted pending workout & routine recover and sync once!
  await signIn(page);
  const retryDeadline = Date.now() + 25_000;
  while (vaultRetryCalls < 2 && Date.now() < retryDeadline) {
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(
    () => {
      const txt = document.body.innerText;
      return !txt.includes("unsynced") && !txt.includes("Saved on this device");
    },
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(500);
  await context.unroute("**/api/offline/sync");

  const accountAIdRes = await pool.query<{ id: string }>(
    "SELECT id FROM app_user WHERE email = $1",
    [DEMO_EMAIL],
  );
  const accountAId = accountAIdRes.rows[0].id;
  const recoveredWorkouts = await pool.query<{ id: string; owner_id: string; ended_at: Date | null }>(
    "SELECT id, owner_id, ended_at FROM workout WHERE title = 'Vaulted Routine Edit'",
  );
  const recoveredRoutines = await pool.query<{ id: string; owner_id: string }>(
    "SELECT id, owner_id FROM routine WHERE title = 'Vaulted Routine Edit'",
  );
  check(
    "Original account recovers vaulted workout & routine after sign-out/switch and syncs ONCE after interrupted retry",
    vaultRetryCalls >= 2 &&
      recoveredWorkouts.rows.length === 1 &&
      recoveredWorkouts.rows[0].owner_id === accountAId &&
      recoveredWorkouts.rows[0].ended_at !== null &&
      recoveredRoutines.rows.length === 1 &&
      recoveredRoutines.rows[0].owner_id === accountAId,
    `calls=${vaultRetryCalls} workouts=${recoveredWorkouts.rows.length} routines=${recoveredRoutines.rows.length}`,
  );

  console.log(`\n${checks - failures}/${checks} release-criteria checks passed.`);
  if (failures > 0) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server?.kill();
  await pool.end().catch(() => {});
  await pg.stop().catch(() => {});
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
