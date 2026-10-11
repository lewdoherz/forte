"use client";

import { deleteExercise } from "@/lib/exercise-actions";
import { useI18n } from "@/lib/i18n/context";

export function DeleteExerciseButton({ id }: { id: string }) {
  const { t } = useI18n();

  return (
    <form action={deleteExercise.bind(null, id)}>
      <button
        type="submit"
        onClick={(event) => {
          if (!confirm(t("exercises.delete.confirm"))) {
            event.preventDefault();
          }
        }}
        className="flex h-11 items-center rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        {t("common.delete")}
      </button>
    </form>
  );
}
