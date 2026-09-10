"use client";

import { useRouter } from "next/navigation";
import { deleteRoutine } from "@/lib/routine-actions";

export function DeleteRoutineButton({ id }: { id: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        if (!confirm("Delete this routine? This cannot be undone.")) return;
        const result = await deleteRoutine(id);
        if (!result.error) {
          router.push("/routines");
          router.refresh();
        }
      }}
      className="flex h-11 items-center rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50"
    >
      Delete
    </button>
  );
}
