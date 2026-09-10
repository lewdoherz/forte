import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXERCISE_TYPES, type ExerciseType } from "../schema/types";

/**
 * One-shot generator for the imported exercise library.
 *
 * Reads the repository-root `exercises/` directory (one `.txt` per exercise,
 * plus a `thumbnails/` folder) and produces the durable artifacts:
 *
 *   - schema/migrations/0011_import_exercise_library.sql
 *   - public/exercise-media/thumbnails/<slug>.jpg
 *
 * Re-runnable and deterministic: the migration is rebuilt from scratch every
 * time and sorted by slug, and the thumbnail copies are idempotent overwrites.
 * The `exercises/` source itself is never modified.
 *
 * The source is a third-party export, so its vocabulary is mapped onto the
 * catalog codes from 0002 rather than used verbatim, and its `exercise_type`
 * (which the source does not state) is inferred from title and equipment —
 * both are reported on stdout for a human to sanity-check.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "exercises");
const MIGRATIONS_DIR = join(ROOT, "schema", "migrations");
const OUTPUT_MIGRATION = join(MIGRATIONS_DIR, "0011_import_exercise_library.sql");
const THUMBNAIL_DIR = join(ROOT, "public", "exercise-media", "thumbnails");

/**
 * Source display value -> muscle_group.code. Every value the library uses is
 * already a catalog code (or an underscored form of one); 0010 adds no rows.
 */
const MUSCLE_CODES: Record<string, string> = {
  Chest: "chest",
  "Upper Back": "upper_back",
  Lats: "lats",
  "Lower Back": "lower_back",
  Traps: "traps",
  Shoulders: "shoulders",
  Biceps: "biceps",
  Triceps: "triceps",
  Forearms: "forearms",
  Abdominals: "abdominals",
  Quadriceps: "quadriceps",
  Hamstrings: "hamstrings",
  Glutes: "glutes",
  Calves: "calves",
  Adductors: "adductors",
  Abductors: "abductors",
  Neck: "neck",
  Cardio: "cardio",
  "Full Body": "full_body",
  Other: "other",
};

/**
 * Source display value -> equipment.code. The library's "None" is the
 * catalog's `bodyweight`: the movement is performed without an implement, and
 * introducing a separate `none` code would split one concept across two rows.
 */
const EQUIPMENT_CODES: Record<string, string> = {
  Barbell: "barbell",
  Dumbbell: "dumbbell",
  Machine: "machine",
  Cable: "cable",
  Kettlebell: "kettlebell",
  Plate: "plate",
  "Resistance Band": "resistance_band",
  Suspension: "suspension",
  "Smith Machine": "smith_machine",
  None: "bodyweight",
  Other: "other",
};

/** Cardio movements measured over a distance; exact title match. */
const DISTANCE_TITLES: Record<string, true> = {
  "air bike": true,
  cycling: true,
  "elliptical trainer": true,
  hiking: true,
  "recumbent bike": true,
  "rowing machine": true,
  running: true,
  skating: true,
  "ski erg": true,
  skiing: true,
  snowboarding: true,
  spinning: true,
  sprints: true,
  swimming: true,
  treadmill: true,
  walking: true,
};

/** Cardio movements with no distance or step metric; exact title match. */
const DURATION_TITLES: Record<string, true> = {
  aerobics: true,
  "battle ropes": true,
  boxing: true,
  hiit: true,
};

interface SourceExercise {
  file: string;
  title: string;
  slug: string;
  exerciseType: ExerciseType;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  howTo: string;
  thumbnail: string | null;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The source does not record how a set is measured, so infer the enum from
 * what the title and equipment reveal. Order matters: the specific signals
 * (assisted/weighted variants, carries, cardio machines, timed holds) come
 * before the equipment-based default.
 */
function inferExerciseType(title: string, equipmentDisplay: string): ExerciseType {
  const t = title.toLowerCase();

  if (/\bassisted\b/.test(t)) return "bodyweight_assisted";
  if (/\bweighted\b/.test(t)) return "bodyweight_weighted";
  if (/\bsled (push|pull)\b/.test(t)) return "short_distance_weight";
  if (/farmers walk|suitcase carry/.test(t)) return "weight_duration";
  // Ungraded "Other" equipment that is nevertheless an external load.
  if (/wall ball|ball slam|sandbag/.test(t)) return "weight_reps";
  if (t === "stair machine (steps)") return "steps_duration";
  if (t === "jump rope") return "steps_duration";
  if (t === "climbing" || t === "stair machine (floors)") return "floors_duration";
  if (/\b(hold|plank|wall sit|dead hang|l-sit)\b/.test(t) && !/push.?up/.test(t)) {
    return "duration";
  }
  if (/stretching|yoga|pilates|warm.?up/.test(t)) return "duration";
  if (DISTANCE_TITLES[t] === true) return "distance_duration";
  if (DURATION_TITLES[t] === true) return "duration";
  if (equipmentDisplay === "None" || equipmentDisplay === "Other") return "bodyweight_reps";
  return "weight_reps";
}

function field(text: string, label: string): string | null {
  const match = new RegExp(`^${label}:\\s*(.*)$`, "m").exec(text);
  return match ? match[1].trim() : null;
}

function parseExercise(file: string): { row: SourceExercise; unmapped: string[] } {
  // Normalise newlines so the generated SQL is identical on every platform.
  const text = readFileSync(join(SOURCE_DIR, file), "utf8").replace(/\r\n?/g, "\n");
  const title = (text.split("\n", 1)[0] ?? "").trim();
  if (!title) throw new Error(`${file}: no title on the first line`);

  const unmapped: string[] = [];
  const mapOrReport = (map: Record<string, string>, value: string | null, kind: string): string => {
    const code = value ? map[value] : undefined;
    if (!code) {
      unmapped.push(`${kind}: ${value ?? "(missing)"}`);
      return "";
    }
    return code;
  };

  const equipmentDisplay = field(text, "Equipment");
  const primaryDisplay = field(text, "Primary Muscle Group");
  const secondaryDisplay = field(text, "Secondary Muscle Group");

  const primaryMuscle = mapOrReport(MUSCLE_CODES, primaryDisplay, "muscle");
  const equipment = mapOrReport(EQUIPMENT_CODES, equipmentDisplay, "equipment");

  const secondaryMuscles: string[] = [];
  for (const raw of (secondaryDisplay ?? "").split(",")) {
    const value = raw.trim();
    if (!value || value.toLowerCase() === "none") continue;
    const code = mapOrReport(MUSCLE_CODES, value, "muscle");
    if (code) secondaryMuscles.push(code);
  }

  const howToMatch = /^How to[ \t]*\n([\s\S]*)$/m.exec(text);
  const howTo = howToMatch ? howToMatch[1].trim() : "";

  const exerciseType = inferExerciseType(title, equipmentDisplay ?? "");
  if (!(EXERCISE_TYPES as readonly string[]).includes(exerciseType)) {
    throw new Error(`${file}: inferred unknown exercise_type ${exerciseType}`);
  }

  return {
    row: {
      file,
      title,
      slug: slugify(title),
      exerciseType,
      primaryMuscle,
      secondaryMuscles,
      equipment,
      howTo,
      thumbnail: field(text, "Thumbnail"),
    },
    unmapped,
  };
}

/** Slugs already seeded by an earlier migration, so we can report collisions. */
function curatedSlugs(): Set<string> {
  const slugs = new Set<string>();
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql") && !name.startsWith("0011"))
    .sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.matchAll(/insert into exercise_template\b[\s\S]*?;/g)) {
      for (const match of statement[0].matchAll(/\('([^']+)'/g)) slugs.add(match[1]);
    }
  }
  return slugs;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const files = readdirSync(SOURCE_DIR)
  .filter((name) => name.endsWith(".txt"))
  .sort();

const rows: SourceExercise[] = [];
const unmappedAll: string[] = [];
for (const file of files) {
  const { row, unmapped } = parseExercise(file);
  rows.push(row);
  for (const value of unmapped) unmappedAll.push(`${file}: ${value}`);
}

// Deterministic output order, and loud failure on data the map does not cover.
rows.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

const bySlug = new Map<string, SourceExercise>();
for (const row of rows) {
  const duplicate = bySlug.get(row.slug);
  if (duplicate) throw new Error(`slug collision: ${row.slug} (${duplicate.file}, ${row.file})`);
  bySlug.set(row.slug, row);
}

if (unmappedAll.length > 0) {
  console.error(`unmapped source vocabulary (${unmappedAll.length}):`);
  for (const value of unmappedAll) console.error(`  - ${value}`);
  throw new Error("extend MUSCLE_CODES/EQUIPMENT_CODES in this script before importing");
}

const curated = curatedSlugs();
const collisions = rows.filter((row) => curated.has(row.slug));
const missingThumbnails: SourceExercise[] = [];

mkdirSync(THUMBNAIL_DIR, { recursive: true });
let thumbnailBytes = 0;
let thumbnailsCopied = 0;
for (const row of rows) {
  const source = row.thumbnail ? join(SOURCE_DIR, row.thumbnail) : null;
  if (!source || !existsSync(source)) {
    missingThumbnails.push(row);
    continue;
  }
  copyFileSync(source, join(THUMBNAIL_DIR, `${row.slug}.jpg`));
  thumbnailBytes += statSync(source).size;
  thumbnailsCopied++;
}

const distribution = new Map<ExerciseType, SourceExercise[]>();
for (const type of EXERCISE_TYPES) distribution.set(type, []);
for (const row of rows) distribution.get(row.exerciseType)?.push(row);

const header = `-- ---------------------------------------------------------------------------
-- 0011_import_exercise_library.sql — generated by scripts/import-exercises.ts
--
-- Do not edit by hand. Re-run \`bun run scripts/import-exercises.ts\` instead.
-- Source: the repository-root exercises/ directory (git-ignored input).
--
-- ${rows.length} exercises: ${rows.length - collisions.length} new rows and ${collisions.length} that
-- already exist in the curated catalog (0005). The upsert below gives those
-- curated rows their how_to text while keeping their hand-chosen title,
-- exercise_type and muscle groups untouched.
--
-- Idempotent: the conflict clause rewrites only how_to, so applying it twice
-- leaves every row unchanged.
-- ---------------------------------------------------------------------------

begin;

insert into exercise_template (slug, title, exercise_type, primary_muscle, secondary_muscles, equipment, how_to) values`;

const values = rows
  .map(
    (row) =>
      `  (${quote(row.slug)}, ${quote(row.title)}, ${quote(row.exerciseType)}, ` +
      `${quote(row.primaryMuscle)}, '{${row.secondaryMuscles.join(",")}}', ` +
      `${quote(row.equipment)}, ${quote(row.howTo)})`,
  )
  .join(",\n");

const sql = `${header}\n${values}\non conflict (slug) do update set how_to = excluded.how_to;\n\ncommit;\n`;

writeFileSync(OUTPUT_MIGRATION, sql, "utf8");

const report: string[] = [];
report.push(`imported ${rows.length} exercises from ${SOURCE_DIR}`);
report.push(
  `rows:        ${rows.length - collisions.length} new, ${collisions.length} colliding with the curated catalog`,
);
report.push(`unmapped:    none`);
report.push(
  `thumbnails:  ${thumbnailsCopied} copied (${(thumbnailBytes / 1e6).toFixed(2)} MB), ` +
    `${missingThumbnails.length} missing`,
);
for (const row of missingThumbnails) {
  report.push(`  - ${row.title} (${row.thumbnail ?? "no Thumbnail field"})`);
}
report.push(`exercise_type distribution:`);
for (const type of EXERCISE_TYPES) {
  const group = distribution.get(type) ?? [];
  report.push(`  ${type.padEnd(20)} ${String(group.length).padStart(3)}  ${group.map((r) => r.title).join(", ")}`);
}
report.push(`least certain inferences (source states no exercise_type):`);
report.push(
  `  - cardio with no distance metric mapped to duration: ` +
    Object.keys(DURATION_TITLES).map((t) => t.replace(/\b\w/g, (c) => c.toUpperCase())).join(", ") +
    `; Jump Rope mapped to steps_duration`,
);
report.push(
  `  - "Other"-equipment rows forced to weight_reps as external loads: Ball Slams, Wall Ball, Walking Lunge (Sandbag)`,
);
report.push(
  `  - reps_only is never inferred; bodyweight movements without load use bodyweight_reps`,
);
report.push(`wrote ${OUTPUT_MIGRATION}`);

console.log(report.join("\n"));
