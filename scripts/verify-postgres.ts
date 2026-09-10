import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Exercises the production PostgreSQL path end to end:
 *   1. applies schema/migrations through scripts/migrate.ts with DATABASE_URL
 *      set and a production environment (so lib/env's production requirements
 *      are genuinely exercised);
 *   2. runs every verification suite against the same real server.
 *
 * `embedded-postgres` ships PostgreSQL binaries, so no Docker and no system
 * install are needed. It is a devDependency used only by this harness — the
 * application itself never imports it, and PGlite remains the zero-config
 * local default.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, ".pgdata-verify");
const PORT = 55432;
const ADMIN_URL = `postgresql://postgres:postgres@localhost:${PORT}/postgres`;

const suites = readdirSync(join(root, "schema", "tests"))
  .filter((file) => file.startsWith("verify-") && file.endsWith(".ts"))
  .sort();

function run(label: string, script: string, env: Record<string, string>): Promise<number> {
  console.log(`\n$ ${label}`);
  const { promise, resolve } = Promise.withResolvers<number>();
  const child = spawn(process.execPath, [join(root, script)], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  child.on("exit", (code) => resolve(code ?? 1));
  return promise;
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: false,
});

console.log(`starting embedded PostgreSQL on :${PORT} ...`);
// initdb refuses a non-empty directory, and a previous crashed run can leave
// one behind (Windows may hold locks briefly), so always start from clean.
await rm(dataDir, { recursive: true, force: true });
await pg.initialise();
await pg.start();

let failed = 0;
let steps = 0;

try {
  steps++;
  if (
    (await run("db:migrate against DATABASE_URL (production env)", "scripts/migrate.ts", {
      DATABASE_URL: ADMIN_URL,
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "postgres-verification-secret-at-least-32-chars",
      BETTER_AUTH_URL: "http://localhost:3000",
    })) !== 0
  ) {
    failed++;
  }

  for (const suite of suites) {
    steps++;
    if ((await run(`schema/tests/${suite}`, `schema/tests/${suite}`, { TEST_DATABASE_URL: ADMIN_URL })) !== 0) {
      failed++;
    }
  }
} finally {
  await pg.stop();
  await rm(dataDir, { recursive: true, force: true });
}

console.log(`\n${steps - failed}/${steps} postgres steps passed`);
process.exit(failed ? 1 : 0);
