import type { DurationRecordDirection, ExerciseType } from "@/schema/types";
import type { OfflineCatalogExercise, OfflineCatalogSnapshot } from "@/lib/offline-store";
import type { Locale } from "@/lib/i18n";

export interface RawBuiltinExercise {
  id: string;
  slug: string;
  title: string;
  title_zh: string | null;
  exercise_type: ExerciseType;
  primary_muscle: string;
  secondary_muscles: string[];
  equipment: string;
  how_to: string | null;
  how_to_zh: string | null;
  media_url: string | null;
  has_thumbnail?: boolean;
  duration_record_direction?: DurationRecordDirection;
  is_custom?: boolean;
}

export interface RawBuiltinCatalog {
  version: number;
  muscles: Array<{ code: string; display_name: string; display_name_zh: string | null }>;
  equipment: Array<{ code: string; display_name: string; display_name_zh: string | null }>;
  exercises: RawBuiltinExercise[];
}

/**
 * Returns the asset prefix for bundled native assets.
 * - On Android & web: `""` (same-origin `/exercise-media/thumbnails/...`, `/body-heatmap/...`)
 * - On iOS offline bundle: `"forte-asset://local"` (served from `Forte.app/OfflineBundle/`
 *   via `WKURLSchemeHandler` while the document stays on `https://<FORTE_HOST>`).
 */
export function nativeAssetBase(): string {
  if (typeof window === "undefined") return "";
  const injected = Reflect.get(window, "__FORTE_ASSET_BASE__");
  return typeof injected === "string" ? injected : "";
}

export function resolveAssetUrl(path: string): string {
  const base = nativeAssetBase();
  if (!base) return path;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("forte-asset://")) {
    return path;
  }
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

let cachedRawCatalog: RawBuiltinCatalog | null = null;
let inflightCatalog: Promise<RawBuiltinCatalog | null> | null = null;

/**
 * Loads the bundled built-in exercise catalogue (`public/offline-catalog.json`
 * or an inlined native snapshot on `window.__FORTE_BUILTIN_CATALOG__`).
 * Works 100% offline from first-ever native launch with zero network calls.
 */
export async function loadBuiltinCatalog(): Promise<RawBuiltinCatalog | null> {
  if (cachedRawCatalog) return cachedRawCatalog;

  if (typeof window !== "undefined") {
    const inlined = Reflect.get(window, "__FORTE_BUILTIN_CATALOG__") as RawBuiltinCatalog | undefined;
    if (inlined && Array.isArray(inlined.exercises) && inlined.exercises.length > 0) {
      cachedRawCatalog = inlined;
      return cachedRawCatalog;
    }
  }

  if (inflightCatalog) return inflightCatalog;
  inflightCatalog = (async () => {
    try {
      const url = resolveAssetUrl("/offline-catalog.json");
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) return null;
      const parsed = (await res.json()) as RawBuiltinCatalog;
      if (!parsed || !Array.isArray(parsed.exercises)) return null;
      cachedRawCatalog = parsed;
      return cachedRawCatalog;
    } catch {
      return null;
    } finally {
      inflightCatalog = null;
    }
  })();

  return inflightCatalog;
}

export function localizeBuiltinCatalog(
  raw: RawBuiltinCatalog,
  locale: Locale,
  ownerId: string,
): OfflineCatalogSnapshot {
  const isZh = locale === "zh-CN";
  const timeZone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      : "UTC";

  return {
    profile: {
      id: ownerId,
      email: "",
      displayName: "Forte",
      timeZone,
      locale,
    },
    muscles: raw.muscles.map((m) => ({
      code: m.code,
      display_name: isZh && m.display_name_zh ? m.display_name_zh : m.display_name,
    })),
    equipment: raw.equipment.map((e) => ({
      code: e.code,
      display_name: isZh && e.display_name_zh ? e.display_name_zh : e.display_name,
    })),
    exercises: raw.exercises.map(
      (ex): OfflineCatalogExercise => ({
        id: ex.id,
        slug: ex.slug,
        title: isZh && ex.title_zh ? ex.title_zh : ex.title,
        primary_muscle: ex.primary_muscle,
        secondary_muscles: ex.secondary_muscles,
        equipment: ex.equipment,
        exercise_type: ex.exercise_type,
        how_to: isZh && ex.how_to_zh ? ex.how_to_zh : ex.how_to,
        media_url: ex.media_url ?? null,
        duration_record_direction: ex.duration_record_direction ?? "higher",
        is_custom: false,
      }),
    ),
    previousPerformances: {},
    cachedAt: new Date().toISOString(),
  };
}

/**
 * Merges a server-cached catalog with the bundled built-in catalog so that
 * even if a device cached an older bootstrap payload (missing `media_url`,
 * `duration_record_direction`, or `how_to`), every built-in exercise still has
 * its complete metadata offline.
 */
export function enrichCatalogWithBuiltin(
  existing: OfflineCatalogSnapshot | undefined,
  raw: RawBuiltinCatalog | null,
  locale: Locale,
  ownerId: string,
): OfflineCatalogSnapshot | undefined {
  if (!raw) return existing;
  const builtin = localizeBuiltinCatalog(raw, locale, ownerId);
  if (!existing || existing.exercises.length === 0) return builtin;

  const builtinBySlug = new Map(builtin.exercises.map((e) => [e.slug, e]));
  const mergedExercises = existing.exercises.map((ex) => {
    const match = builtinBySlug.get(ex.slug);
    if (!match) return ex;
    return {
      ...ex,
      how_to: ex.how_to ?? match.how_to,
      media_url: ex.media_url ?? match.media_url ?? null,
      duration_record_direction:
        ex.duration_record_direction ?? match.duration_record_direction ?? "higher",
    };
  });

  // Also ensure any built-in exercises absent from an older partial cache are available.
  const seenSlugs = new Set(mergedExercises.map((e) => e.slug));
  for (const b of builtin.exercises) {
    if (!seenSlugs.has(b.slug)) mergedExercises.push(b);
  }

  return {
    ...existing,
    muscles: existing.muscles.length > 0 ? existing.muscles : builtin.muscles,
    equipment: existing.equipment.length > 0 ? existing.equipment : builtin.equipment,
    exercises: mergedExercises,
  };
}
