import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const migrationsDir = join(root, "schema", "migrations");
const dataDir = join(root, ".pglite");

const db = new PGlite(dataDir);

await db.exec(
  `create table if not exists schema_migrations (
     name text primary key,
     applied_at timestamptz not null default now()
   )`,
);

const applied = new Set(
  (await db.query<{ name: string }>("select name from schema_migrations")).rows.map(
    (r) => r.name,
  ),
);

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const f of files) {
  if (applied.has(f)) {
    console.log(`skip   ${f} (already applied)`);
    continue;
  }
  const sql = readFileSync(join(migrationsDir, f), "utf8");
  await db.exec(sql);
  await db.query("insert into schema_migrations (name) values ($1)", [f]);
  console.log(`apply  ${f}`);
}

await db.close();
console.log("migrations up to date");
