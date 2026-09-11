"use client";

import { useRouter } from "next/navigation";
import { deleteRoutine } from "@/lib/routine-actions";

/**
 * Confirms and deletes a routine, returning whether it happened.
 *
 * Exported so the routine card's overflow menu runs the SAME confirmation
 * rather than growing a second one. The caller decides where to go afterwards:
 * the detail button leaves the routine, the card refreshes in place.
 */
export async function confirmDeleteRoutine(id: string): Promise<boolean> {
  if (!confirm("Delete this routine? This cannot be undone.")) return false;
  const result = await deleteRoutine(id);
  return !result.error;
}

export function DeleteRoutineButton({ id }: { id: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await confirmDeleteRoutine(id))) return;
        router.push("/routines");
        router.refresh();
      }}
      className="flex h-11 items-center rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50"
    >
      Delete
    </button>
  );
}
