import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Minimal SQL surface shared by PGlite and node-postgres.
 *
 * Both are needed: `exec` runs multi-statement scripts (migration files) with
 * no parameters, which the extended query protocol used by `query` cannot do.
 */
export interface SqlTarget {
  exec(sql: string): Promise<void>;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "schema",
  "migrations",
);

/** Every migration file, in application order. */
export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/**
 * Applies every pending migration, recorded in `schema_migrations`.
 * Idempotent — already-applied files are skipped — so it is safe against an
 * existing database in any dialect.
 */
export async function applyMigrations(
  target: SqlTarget,
  log: (line: string) => void = () => {},
): Promise<void> {
  await target.exec(
    `create table if not exists schema_migrations (
       name       text primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  const appliedRows = await target.query<{ name: string }>(
    "select name from schema_migrations",
  );
  const applied = new Set(appliedRows.rows.map((row) => row.name));

  for (const file of migrationFiles()) {
    if (applied.has(file)) {
      log(`skip    ${file} (already applied)`);
      continue;
    }
    await target.exec(readFileSync(join(migrationsDir, file), "utf8"));
    await target.query("insert into schema_migrations (name) values ($1)", [file]);
    log(`apply   ${file}`);
  }
}
