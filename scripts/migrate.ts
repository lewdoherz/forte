import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { join } from "node:path";
import { env } from "../lib/env";
import { applyMigrations, type SqlTarget } from "./apply-migrations";

/**
 * Applies schema/migrations to whichever database this process is configured
 * for: `DATABASE_URL` (PostgreSQL) when set, otherwise the local PGlite data
 * directory. Both paths share one applier so the two dialects cannot drift.
 */
const connectionString = env.DATABASE_URL;

if (connectionString) {
  const pool = new Pool({ connectionString });
  try {
    const target: SqlTarget = {
      exec: async (sql) => {
        await pool.query(sql);
      },
      query: async <T>(sql: string, params?: unknown[]) => {
        // node-postgres constrains its row type to QueryResultRow; the shared
        // SqlTarget contract is deliberately looser, so narrow here.
        const result = await pool.query<Record<string, unknown>>(sql, params);
        return { rows: result.rows as T[] };
      },
    };
    await applyMigrations(target, (line) => console.log(line));
    // Never echo credentials into build/deploy logs.
    console.log(`migrations up to date (postgres: ${connectionString.replace(/\/\/[^@/]*@/, "//***:***@")})`);
  } finally {
    await pool.end();
  }
} else {
  const pglite = new PGlite(join(process.cwd(), ".pglite"));
  try {
    const target: SqlTarget = {
      exec: async (sql) => {
        await pglite.exec(sql);
      },
      query: async <T>(sql: string, params?: unknown[]) => {
        const result = await pglite.query<T>(sql, params);
        return { rows: result.rows };
      },
    };
    await applyMigrations(target, (line) => console.log(line));
    console.log("migrations up to date (pglite: .pglite)");
  } finally {
    await pglite.close();
  }
}
