/**
 * Generates `public/offline-catalog.json` directly from the repository SQL
 * migrations via PGlite so the offline/native built-in exercise library stays
 * 100% aligned with Forte's source catalogue (450 active exercises, EN & zh-CN
 * titles and how-to instructions, muscles, equipment, and media paths).
 *
 * Deterministic UUIDs (derived from slug via SHA-256) ensure fresh-install
 * offline workouts and routines remain stable across rebuilds and can be
 * remapped cleanly by slug to any server database when a user later signs in.
 */
import { createHash } from "node:crypto";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestDatabase } from "../schema/tests/harness";

function deterministicSlugUuid(slug: string): string {
  const hash = createHash("sha256").update(`forte:catalog:v1:${slug}`).digest();
  // Set RFC 4122 version 5 and variant 1 bits so every UUID passes strict zod .uuid() validation.
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function main() {
  const { db, close } = await createTestDatabase();
  try {
    const [muscles, equipment, exercises] = await Promise.all([
      db
        .selectFrom("muscle_group")
        .select(["code", "display_name", "display_name_zh", "sort_order"])
        .orderBy("sort_order", "asc")
        .execute(),
      db
        .selectFrom("equipment")
        .select(["code", "display_name", "display_name_zh", "sort_order"])
        .orderBy("sort_order", "asc")
        .execute(),
      db
        .selectFrom("exercise_template")
        .select([
          "slug",
          "title",
          "title_zh",
          "exercise_type",
          "primary_muscle",
          "secondary_muscles",
          "equipment",
          "media_url",
          "how_to",
          "how_to_zh",
          "duration_record_direction",
        ])
        .where("is_custom", "=", false)
        .where("archived_at", "is", null)
        .orderBy("title", "asc")
        .execute(),
    ]);

    const thumbFiles = new Set(
      readdirSync(join(process.cwd(), "public", "exercise-media", "thumbnails"))
        .filter((f) => f.toLowerCase().endsWith(".jpg"))
        .map((f) => f.replace(/\.jpg$/i, "")),
    );

    const payload = {
      version: 1,
      muscles: muscles.map((m) => ({
        code: m.code,
        display_name: m.display_name,
        display_name_zh: m.display_name_zh,
      })),
      equipment: equipment.map((e) => ({
        code: e.code,
        display_name: e.display_name,
        display_name_zh: e.display_name_zh,
      })),
      exercises: exercises.map((ex) => ({
        id: deterministicSlugUuid(ex.slug),
        slug: ex.slug,
        title: ex.title,
        title_zh: ex.title_zh,
        exercise_type: ex.exercise_type,
        primary_muscle: ex.primary_muscle,
        secondary_muscles: ex.secondary_muscles,
        equipment: ex.equipment,
        how_to: ex.how_to,
        how_to_zh: ex.how_to_zh,
        media_url: ex.media_url,
        has_thumbnail: thumbFiles.has(ex.slug),
        duration_record_direction: ex.duration_record_direction,
        is_custom: false,
      })),
    };

    const outPath = join(process.cwd(), "public", "offline-catalog.json");
    writeFileSync(outPath, JSON.stringify(payload), "utf8");
    const withThumb = payload.exercises.filter((e) => e.has_thumbnail).length;
    const withRealHowTo = payload.exercises.filter(
      (e) => e.how_to && !/no how-to/i.test(e.how_to),
    ).length;
    console.log(
      `Generated ${outPath}: ${payload.exercises.length} exercises (${withThumb} thumbnails, ${withRealHowTo} full how-to), ${payload.muscles.length} muscles, ${payload.equipment.length} equipment.`,
    );
  } finally {
    await close();
  }
}

await main();
