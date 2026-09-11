/**
 * A custom exercise's user-supplied image.
 *
 * `media_url` normally holds a demonstration *video* path (migration 0012), but
 * for a custom exercise the create/edit dialog writes an image URL there — there
 * is no runtime blob upload path for user images (the only uploader is a script
 * that needs a blob token the app does not have), so the dialog asks for a URL.
 * The detail page decides between this and `ExerciseVideo` by looking at the
 * path's extension, so an image URL never reaches the video element.
 *
 * A plain `<img>` rather than `next/image`: the URL is user-supplied, so it
 * cannot be allow-listed in `next.config.ts`, and the optimizer would log a
 * server error per unlisted host.
 */
export function ExerciseImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see the note above
    <img
      src={src}
      alt={alt}
      className={`h-auto w-full rounded-xl border border-zinc-200 bg-white object-cover ${className}`}
    />
  );
}
