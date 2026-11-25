"use client";

import { useEffect, useRef, useState } from "react";
import { resolveAssetUrl } from "@/lib/builtin-catalog";

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

export function exerciseThumbnailUrl(slug: string): string {
  return resolveAssetUrl(`${THUMBNAIL_PREFIX}/${encodeURIComponent(slug)}.jpg`);
}

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
    setStatus(image.naturalWidth === 0 ? "failed" : "loaded");
  }, [slug]);

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
        src={exerciseThumbnailUrl(slug)}
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

/**
 * Demonstration visual for an exercise's How-to tab.
 *
 * Online with a configured remote video, renders the looping MP4 clip with the
 * bundled illustration as poster. Offline (or when the clip fails or is absent),
 * renders the bundled demonstration illustration cleanly with zero broken video
 * chrome so every exercise works offline from first launch.
 */
export function ExerciseVideo({
  slug,
  mediaUrl,
  title = "",
  className = "",
}: {
  slug: string;
  mediaUrl: string | null;
  title?: string;
  className?: string;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
  const posterSrc = exerciseThumbnailUrl(slug);
  const [videoFailed, setVideoFailed] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const canPlayVideo = Boolean(online && baseUrl && mediaUrl && !videoFailed);

  if (canPlayVideo && baseUrl && mediaUrl) {
    return (
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        poster={posterSrc}
        onError={() => setVideoFailed(true)}
        className={`max-h-72 w-full rounded-2xl border border-[var(--border-subtle)] bg-white object-contain ${className}`}
      >
        <source src={`${baseUrl.replace(/\/+$/, "")}/${mediaUrl}`} type="video/mp4" />
      </video>
    );
  }

  if (thumbFailed) return null;

  return (
    <div
      className={`flex items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-white p-4 shadow-xs ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- bundled static demonstration illustration */}
      <img
        src={posterSrc}
        alt={title ? `${title} demonstration` : ""}
        onError={() => setThumbFailed(true)}
        className="max-h-60 w-auto max-w-full object-contain"
      />
    </div>
  );
}
