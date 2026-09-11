"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { duplicateRoutine } from "@/lib/routine-actions";
import { confirmDeleteRoutine } from "@/components/delete-routine-button";

/**
 * A routine card's overflow menu: Edit, Duplicate, Delete.
 *
 * Duplicate round-trips through the server action and then refreshes, so the new
 * card appears without a full navigation. Delete delegates to the shared
 * confirmation in `delete-routine-button.tsx`.
 */
export function RoutineCardMenu({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Routine actions"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 text-lg leading-none hover:bg-zinc-100"
      >
        …
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg"
        >
          <Link
            role="menuitem"
            href={`/routines/${id}/edit`}
            className="block px-3 py-2 text-sm hover:bg-zinc-50"
          >
            Edit
          </Link>
          <button
            role="menuitem"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await duplicateRoutine(id);
              setBusy(false);
              setOpen(false);
              if (!result.error) router.refresh();
            }}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-60"
          >
            {busy ? "Duplicating…" : "Duplicate"}
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              setOpen(false);
              if (await confirmDeleteRoutine(id)) router.refresh();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
