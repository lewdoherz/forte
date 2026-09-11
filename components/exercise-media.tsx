"use client";

import { useEffect, useRef, useState } from "react";

/** Where the exercise import puts thumbnails and videos, relative to the app. */
const THUMBNAIL_PREFIX = "/exercise-media/thumbnails";

/**
 * An exercise's thumbnail, by slug.
 *
 * Most of the catalog has no artwork yet, so a failed load has to leave the page
 * looking the way it did before media existed rather than showing a broken
 * image: the element is invisible until it actually loads, and removes itself if
 * it does not. That is also why this is a plain `<img>` rather than
 * `next/image` — a missing file would be routed through the optimizer, logging a
 * server error per thumbnail, and the optimizer buys nothing for a fixed-size
 * local image.
 */
export function ExerciseThumbnail({ slug }: { slug: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<"pending" | "loaded" | "failed">("pending");

  useEffect(() => {
    const image = ref.current;
    if (!image || !image.complete) return;
    // The browser can finish — and fail — the request before hydration attaches
    // `onError`, which would leave the broken image on screen. A completed load
    // with no intrinsic width is that same failure, observed one tick later.
    setStatus(image.naturalWidth === 0 ? "failed" : "loaded");
  }, []);

  if (status === "failed") return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- see the note above
    <img
      ref={ref}
      src={`${THUMBNAIL_PREFIX}/${encodeURIComponent(slug)}.jpg`}
      // Decorative: the exercise title sits beside it, so repeating it here would
      // only make a screen reader say it twice.
      alt=""
      width={80}
      height={80}
      onLoad={() => setStatus("loaded")}
      onError={() => setStatus("failed")}
      className={`h-20 w-20 shrink-0 rounded-xl border border-zinc-200 bg-white object-cover ${
        status === "loaded" ? "" : "invisible"
      }`}
    />
  );
}

/**
 * The example video for an exercise.
 *
 * `ExerciseVideo` renders only when the exercise row records where its media
 * lives (`media_url`), and that path is relative — the host comes from
 * `NEXT_PUBLIC_MEDIA_BASE_URL`. That keeps two things true at once: an exercise
 * whose video was never uploaded shows no player rather than a control pointing
 * at a 404, and switching blob stores stays a configuration change instead of a
 * data migration.
 *
 * The base URL is also the switch: unset means "no video hosting is configured",
 * and the element is not rendered at all. `preload="none"` keeps a visit to the
 * instructions from downloading a video the reader may never play, and the
 * thumbnail doubles as the poster when one has been imported.
 */
export function ExerciseVideo({ slug, mediaUrl }: { slug: string; mediaUrl: string | null }) {
  const baseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
  if (!baseUrl || !mediaUrl) return null;

  return (
    <video
      controls
      preload="none"
      poster={`${THUMBNAIL_PREFIX}/${encodeURIComponent(slug)}.jpg`}
      className="mt-2 aspect-video w-full rounded-xl border border-zinc-200 bg-black"
    >
      <source src={`${baseUrl.replace(/\/+$/, "")}/${mediaUrl}`} type="video/mp4" />
    </video>
  );
}
