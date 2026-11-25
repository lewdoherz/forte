"use client";

import { useEffect, useRef, useState } from "react";

/** Where the exercise import puts thumbnails and videos, relative to the app. */
const THUMBNAIL_PREFIX = "/exercise-media/thumbnails";

/**
 * Two rendered sizes for exercise thumbnails:
 * - `sm`: compact lists (history cards, pickers, compact routine lists)
 * - `md`: exercise headers (active logger, routine editor, workout recap, library)
 *
 * Circular white frame with ~15% inner padding (`p-1.5` / `p-2.5`) so every
 * corner of a square illustration fits strictly inside the inscribed circle
 * without clipping barbells, racks, benches, or feet.
 */
const THUMBNAIL_SIZES = {
  sm: { frame: "h-11 w-11 p-1.5", pixels: 44 },
  md: { frame: "h-16 w-16 p-2 sm:h-20 sm:w-20 sm:p-2.5", pixels: 80 },
} as const;

export function ExerciseThumbnail({
  slug,
  size = "md",
}: {
  slug: string;
  size?: keyof typeof THUMBNAIL_SIZES;
}) {
  const box = THUMBNAIL_SIZES[size];
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
    <span
      className={`exercise-thumb-frame inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border-subtle)] bg-white shadow-xs ${box.frame} ${
        status === "loaded" ? "" : "invisible"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local static thumbnails bypass optimizer */}
      <img
        ref={ref}
        src={`${THUMBNAIL_PREFIX}/${encodeURIComponent(slug)}.jpg`}
        // Decorative: the exercise title sits beside it, so repeating it here would
        // only make a screen reader say it twice.
        alt=""
        width={box.pixels}
        height={box.pixels}
        loading="lazy"
        decoding="async"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("failed")}
        className="h-full w-full object-contain"
      />
    </span>
  );
}

export function ExerciseVideo({
  slug,
  mediaUrl,
  className = "",
}: {
  slug: string;
  mediaUrl: string | null;
  className?: string;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
  if (!baseUrl || !mediaUrl) return null;

  return (
    <video
      autoPlay
      muted
      playsInline
      preload="auto"
      poster={`${THUMBNAIL_PREFIX}/${encodeURIComponent(slug)}.jpg`}
      className={`h-auto w-full rounded-xl border border-zinc-200 bg-black ${className}`}
    >
      <source src={`${baseUrl.replace(/\/+$/, "")}/${mediaUrl}`} type="video/mp4" />
    </video>
  );
}
