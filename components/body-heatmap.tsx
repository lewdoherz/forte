import {
  HEATMAP_ASPECT_RATIO,
  HEATMAP_BASE_ART,
  HEATMAP_SIDES,
  heatmapArtUrl,
  MUSCLE_HEATMAP_ART,
  type HeatmapSide,
} from "@/lib/body-heatmap";
import { heatmapOpacities } from "@/lib/muscle-distribution";

const SIDE_LABELS: Record<HeatmapSide, string> = { front: "Front", back: "Back" };

/**
 * Front and back body heatmaps.
 *
 * `muscleValues` is `muscle_group.code -> weight`. The component owns only the
 * *intensity* mapping (`heatmapOpacities`, the reference's `weight / max`): which
 * muscles an exercise works is decided by `lib/muscle-distribution.ts`, so the
 * two concerns cannot drift. Codes with no art — `cardio`, `full_body`, `other`
 * — are simply not drawn; they still appear in the companion table.
 *
 * Both sides render from the same layer list; a muscle invisible from one side
 * resolves to its `(empty)` placeholder, a fully transparent no-op, which is why
 * one muscle list can drive two figures.
 */
export function BodyHeatmap({
  muscleValues,
  className = "",
}: {
  muscleValues: Record<string, number>;
  className?: string;
}) {
  const opacities = heatmapOpacities(muscleValues);
  const layers = Object.entries(MUSCLE_HEATMAP_ART).filter(
    ([muscle]) => (opacities[muscle] ?? 0) > 0,
  );
  const hasData = layers.length > 0;

  return (
    <div className={className}>
      {/* Two equal grid tracks (minmax(0, 1fr)) rather than flex: a flex item's
          min-content width is the image's intrinsic 352px, which would push the
          figures past the panel. `max-w-xs` caps the pair at the reference's
          silhouette size on a wide screen. */}
      <div className="mx-auto grid w-full max-w-xs grid-cols-2 gap-6">
        {HEATMAP_SIDES.map((side) => (
          <figure key={side}>
            <div
              // The wrapper reserves the reference's ratio (8/19); every layer is
              // absolutely positioned to fill it, so the base and the muscle art
              // stay registered however the figure is sized.
              className="relative w-full"
              style={{ aspectRatio: HEATMAP_ASPECT_RATIO }}
            >
              {/* Plain <img>, matching ExerciseImage: local fixed-size art, so
                  the optimizer adds nothing and would have to encode the
                  parenthesised `(empty)` file names as image paths. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heatmapArtUrl(HEATMAP_BASE_ART[side])}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full"
              />
              {layers.map(([muscle, art]) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={muscle}
                  src={heatmapArtUrl(art[side])}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full"
                  style={{ opacity: opacities[muscle] }}
                />
              ))}
            </div>
            <figcaption className="mt-1 text-center text-xs text-zinc-500">
              {SIDE_LABELS[side]}
            </figcaption>
          </figure>
        ))}
      </div>
      {hasData ? null : (
        <p className="mt-2 text-center text-xs text-zinc-500">No muscle data yet.</p>
      )}
    </div>
  );
}
