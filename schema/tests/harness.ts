import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../lib/db";
import { applyMigrations, type SqlTarget } from "../../scripts/apply-migrations";

/**
 * Test database factory shared by every verification suite.
 *
 * With `TEST_DATABASE_URL` set the suite runs against a real PostgreSQL server
 * in a freshly created database; otherwise it runs against an in-memory PGlite
 * instance. Both dialects get the full migration set applied.
 *
 * Deliberately keyed on `TEST_DATABASE_URL` and never on `DATABASE_URL`, so a
 * suite can never be pointed at a development or production database by
 * accident: running the tests requires opting in explicitly.
 */
export interface TestDatabase extends SqlTarget {
  dialect: "pglite" | "postgres";
  db: Kysely<Database>;
  close(): Promise<void>;
}

/** Database created and dropped by each suite when testing against Postgres. */
const TEST_DATABASE_NAME = "forte_verify";

export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  return adminUrl ? createPostgres(adminUrl) : createPglite();
}

async function createPglite(): Promise<TestDatabase> {
  const pglite = new PGlite();
  const exec = async (sql: string): Promise<void> => {
    await pglite.exec(sql);
  };
  const query = async <T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> => {
    const result = await pglite.query<T>(sql, params);
    return { rows: result.rows };
  };

  await applyMigrations({ exec, query });

  const db = new Kysely<Database>({ dialect: new PGliteDialect({ pglite }) });
  return {
    dialect: "pglite",
    db,
    exec,
    query,
    close: async () => {
      await db.destroy();
    },
  };
}

async function createPostgres(adminUrl: string): Promise<TestDatabase> {
  // Fresh database per run. `with (force)` terminates stragglers, so an
  // interrupted previous run cannot wedge the next one (PostgreSQL 13+).
  const admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query(`drop database if exists ${TEST_DATABASE_NAME} with (force)`);
    await admin.query(`create database ${TEST_DATABASE_NAME}`);
  } finally {
    await admin.end();
  }

  const target = new URL(adminUrl);
  target.pathname = `/${TEST_DATABASE_NAME}`;
  const pool = new Pool({ connectionString: target.toString() });
  const exec = async (sql: string): Promise<void> => {
    await pool.query(sql);
  };
  const query = async <T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> => {
    // See scripts/migrate.ts: node-postgres constrains its row type.
    const result = await pool.query<Record<string, unknown>>(sql, params);
    return { rows: result.rows as T[] };
  };

  await applyMigrations({ exec, query });

  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  return {
    dialect: "postgres",
    db,
    exec,
    query,
    close: async () => {
      await db.destroy();
      // Leave no trace: the scratch database is dropped once the suite is done.
      // Without this a run against a managed server accumulates stranded
      // databases — it did, the first time the suite was pointed at a real one.
      const admin = new Pool({ connectionString: adminUrl });
      try {
        await admin.query(`drop database if exists ${TEST_DATABASE_NAME} with (force)`);
      } finally {
        await admin.end();
      }
    },
  };
}
