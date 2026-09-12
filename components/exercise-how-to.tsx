import { ExerciseVideo } from "@/components/exercise-media";

/**
 * Turns the imported library's numbered body ("1. …\n2. …") into its steps.
 *
 * The column is one free-form text blob (migration 0010), so there is no list to
 * read: the authored numbering is the only structure there is. It is split only
 * when *every* non-empty line carries its own number, which keeps the original
 * order and numbering in an ordered list. Anything else — a prose note, a
 * "(no How-to steps)" placeholder, a future free-form body — returns null and
 * the caller prints the text verbatim, rather than guessing at a structure the
 * text does not have.
 */
function splitNumberedSteps(howTo: string | null): string[] | null {
  if (!howTo) return null;
  const lines = howTo
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 || !lines.every((line) => /^\d+[.)]\s+\S/.test(line))) return null;
  return lines.map((line) => line.replace(/^\d+[.)]\s+/, ""));
}

/**
 * The How To tab: the exercise's demonstration clip and its written
 * instructions. Both come from the exercise row as imported — nothing here
 * generates, reorders or embellishes a step.
 *
 * The clip is instructional media, so it lives here rather than in the stable
 * header, and only a video path reaches this component: an image URL in
 * `media_url` (a custom exercise) is the header's image.
 */
export function ExerciseHowTo({
  title,
  slug,
  videoUrl,
  howTo,
}: {
  title: string;
  slug: string;
  /** A relative video path, or null when the exercise has no clip. */
  videoUrl: string | null;
  /** The raw `how_to` body, or null when the exercise has no instructions. */
  howTo: string | null;
}) {
  // Neither a clip nor a body: say so on purpose, instead of leaving a blank
  // panel that reads as a rendering bug. Custom exercises land here until their
  // author writes instructions.
  if (!videoUrl && !howTo) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-zinc-700">No instructions for {title} yet</p>
        <p className="mt-1 text-sm text-zinc-500">
          This exercise has no demonstration clip or written steps.
        </p>
      </div>
    );
  }

  const steps = splitNumberedSteps(howTo);

  return (
    <div className="space-y-6">
      <ExerciseVideo slug={slug} mediaUrl={videoUrl} />

      {steps ? (
        <ol className="list-decimal space-y-2 rounded-xl border border-zinc-200 bg-white p-4 pl-9 text-sm leading-relaxed shadow-sm">
          {steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      ) : howTo ? (
        // Source text with its own line breaks: preserving them is the whole
        // point, so it must not be reflowed.
        <p className="whitespace-pre-line rounded-xl border border-zinc-200 bg-white p-4 text-sm leading-relaxed shadow-sm">
          {howTo}
        </p>
      ) : (
        <p className="text-sm text-zinc-500">No written instructions for {title} yet.</p>
      )}
    </div>
  );
}
