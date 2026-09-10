/**
 * Uploads the exercise videos to Vercel Blob.
 *
 * A repeatable tool rather than a one-off. The videos are 189 MB of source input
 * that must not live in the repository, so any fresh environment needs a way to
 * populate the store — and re-running this is the answer.
 *
 * Slugs come from the database rather than being re-derived here: the import
 * migration is the authority on what each exercise is called, and deriving them
 * a second way is how the two drift apart.
 *
 * Requires BLOB_READ_WRITE_TOKEN. The store must be public: these are videos the
 * browser fetches directly by URL, not through a signed route.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=... bun run scripts/upload-exercise-videos.ts
 *   ... --dry-run          list what would be uploaded, upload nothing
 *   ... --only=<slug>      upload one exercise
 */
import { put } from "@vercel/blob";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../lib/db";

const VIDEO_DIR = join(process.cwd(), "exercises", "vids");
/** Blob path prefix. The app builds `${NEXT_PUBLIC_MEDIA_BASE_URL}/<slug>.mp4`. */
const PREFIX = "exercise-videos";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? null;

if (!dryRun && !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is not set. Create the store, connect it, and pass the token.");
  process.exit(1);
}

/**
 * Source filenames are `<Title> [<external id>].mp4`, and the title in the file
 * is the one the import used, so the title is the join between the two.
 */
function findSourceFile(title: string, entries: string[]): string | undefined {
  const prefix = `${title} [`;
  return entries.find((name) => name.startsWith(prefix) && name.endsWith(".mp4"));
}

async function main() {
  const entries = await readdir(VIDEO_DIR);

  const rows = await db
    .selectFrom("exercise_template")
    .select(["slug", "title"])
    .orderBy("title", "asc")
    .execute();

  const targets = only ? rows.filter((r) => r.slug === only) : rows;
  if (targets.length === 0) {
    console.error(only ? `No exercise with slug ${only}.` : "No exercises found — run db:migrate first.");
    process.exit(1);
  }

  let uploaded = 0;
  let skipped = 0;
  const missing: string[] = [];
  const failed: string[] = [];

  for (const [index, row] of targets.entries()) {
    const file = findSourceFile(row.title, entries);
    if (!file) {
      missing.push(row.title);
      continue;
    }

    const label = `[${index + 1}/${targets.length}] ${row.title}`;
    if (dryRun) {
      console.log(`${label} -> ${PREFIX}/${row.slug}.mp4 (from ${file})`);
      skipped++;
      continue;
    }

    try {
      await put(`${PREFIX}/${row.slug}.mp4`, await readFile(join(VIDEO_DIR, file)), {
        access: "public",
        // The app addresses each video by its slug, so the pathname has to be
        // exactly what it derives. A random suffix would break every URL.
        addRandomSuffix: false,
        contentType: "video/mp4",
      });
      uploaded++;
      console.log(`${label} -> ${PREFIX}/${row.slug}.mp4`);
    } catch (error) {
      failed.push(row.title);
      console.error(`${label} FAILED: ${String(error instanceof Error ? error.message : error).slice(0, 200)}`);
    }
  }

  console.log(
    `\n${uploaded} uploaded, ${skipped} listed, ${missing.length} with no source video, ${failed.length} failed`,
  );
  if (missing.length) console.log(`no source video: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? " …" : ""}`);
  if (failed.length) console.log(`failed: ${failed.slice(0, 10).join(", ")}${failed.length > 10 ? " …" : ""}`);

  await db.destroy();
  process.exit(failed.length ? 1 : 0);
}

await main();
