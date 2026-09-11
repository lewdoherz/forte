/**
 * Body-heatmap artwork.
 *
 * The source assets live under `exercises/body-heatmap/`, which is gitignored
 * (200 MB of import input), so the copies the app serves are in
 * `public/body-heatmap/`. This map is transcribed from that directory's
 * `structure.json` and is the single place the app learns which file draws which
 * muscle on which side — the component and its callers never build a file name
 * themselves. A muscle with no entry here has no art and is simply not drawn
 * (the summary table still lists it).
 */

export const HEATMAP_SIDES = ["front", "back"] as const;
export type HeatmapSide = (typeof HEATMAP_SIDES)[number];

export interface MuscleArt {
  front: string;
  back: string;
}

/**
 * `muscle_group.code` -> art file per side, exactly as `structure.json` lists
 * it. Several entries point at a `(empty)` file on one side: it is a fully
 * transparent no-op that absorbs the side the muscle is not visible from, so
 * both heatmaps can be driven by the same muscle list.
 */
export const MUSCLE_HEATMAP_ART: Record<string, MuscleArt> = {
  abdominals: { front: "male_front_abdominals.png", back: "male_back_abdominals.png" },
  abductors: { front: "male_front_abductors.png", back: "male_back_abductors(empty).png" },
  adductors: { front: "male_front_adductors.png", back: "male_back_adductors.png" },
  biceps: { front: "male_front_biceps.png", back: "male_back_biceps.png" },
  calves: { front: "male_front_calves.png", back: "male_back_calves.png" },
  chest: { front: "male_front_chest.png", back: "male_back_chest(empty).png" },
  forearms: { front: "male_front_forearms.png", back: "male_back_forearms.png" },
  glutes: { front: "male_front_glutes(empty).png", back: "male_back_glutes.png" },
  hamstrings: { front: "male_front_hamstrings(empty).png", back: "male_back_hamstrings.png" },
  lats: { front: "male_front_lats.png", back: "male_back_lats.png" },
  lower_back: { front: "male_front_lower_back(empty).png", back: "male_back_lower_back.png" },
  neck: { front: "male_front_neck.png", back: "male_back_neck.png" },
  quadriceps: { front: "male_front_quadriceps.png", back: "male_back_quadriceps.png" },
  shoulders: { front: "male_front_shoulder.png", back: "male_back_shoulder.png" },
  traps: { front: "male_front_traps.png", back: "male_back_traps.png" },
  triceps: { front: "male_front_triceps.png", back: "male_back_triceps.png" },
  upper_back: { front: "male_front_upper-back.png", back: "male_back_upper-back.png" },
};

/** Neutral silhouette drawn under the muscle layers, one per side. */
export const HEATMAP_BASE_ART: Record<HeatmapSide, string> = {
  front: "male_front_base.png",
  back: "male_back_base.png",
};

/**
 * The layer wrapper's aspect ratio (8/19). The PNGs are 352x858, so the box is a
 * hair wider than the art — that is what the reference reserves, and matching it
 * keeps the rendered silhouette identical.
 */
export const HEATMAP_ASPECT_RATIO = 0.42105263;

/**
 * Public URL for an art file. Parentheses appear in the `(empty)` names and are
 * legal in a path segment, so encoding leaves them alone; the helper exists so
 * no caller concatenates the prefix by hand.
 */
export function heatmapArtUrl(file: string): string {
  return `/body-heatmap/${encodeURIComponent(file)}`;
}
