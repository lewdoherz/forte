import type { ExerciseTemplate } from "@/schema/types";

/**
 * The slice of an exercise the Library panel renders.
 *
 * The panel is a long-lived client component sitting in the exercises layout, and
 * the whole visible catalog is handed to it on first paint. Projecting to just
 * these fields keeps that payload small and makes the panel's contract explicit —
 * anything the panel does not render cannot leak into it.
 */
export interface LibraryExercise {
  id: string;
  slug: string;
  title: string;
  primary_muscle: string;
  is_custom: boolean;
}

export function toLibraryExercise(
  row: Pick<ExerciseTemplate, "id" | "slug" | "title" | "primary_muscle" | "is_custom">,
): LibraryExercise {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    primary_muscle: row.primary_muscle,
    is_custom: row.is_custom,
  };
}
