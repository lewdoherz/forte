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
        className="flex h-11 items-center rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}
