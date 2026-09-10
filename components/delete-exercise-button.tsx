"use client";

import { deleteExercise } from "@/lib/exercise-actions";

export function DeleteExerciseButton({ id }: { id: string }) {
  return (
    <form action={deleteExercise.bind(null, id)}>
      <button
        type="submit"
        onClick={(event) => {
          if (!confirm("Delete this exercise? This cannot be undone.")) {
            event.preventDefault();
          }
        }}
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}
