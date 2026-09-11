"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * A dialog's dismissal strategy, stated by the route that rendered it.
 *
 * `back` is for the intercepted route: Next opened this over the page the
 * reader came from, so `router.back()` restores that page — with the Library's
 * filters intact. `navigate` is for a direct visit (`/exercises/new` as the
 * first page): there is nothing to go back to, so it goes to `fallbackHref`
 * instead. Pushing the underlying route does NOT dismiss an intercepted dialog,
 * which is why the two cases cannot share one strategy.
 */
export type ExerciseDialogDismiss = "back" | "navigate";

/**
 * The dialog chrome shared by the create and edit routes.
 *
 * The same component is rendered by the intercepted route (via the `@modal`
 * slot) and by a direct visit, so the two presentations cannot drift apart.
 */
export function ExerciseFormModal({
  title,
  dismiss,
  fallbackHref = "/exercises",
  children,
}: {
  title: string;
  dismiss: ExerciseDialogDismiss;
  /** Where a direct visit closes to. */
  fallbackHref?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const close = useCallback(() => {
    if (dismiss === "back") router.back();
    else router.push(fallbackHref);
  }, [dismiss, fallbackHref, router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-4 sm:items-center"
      onClick={(event) => {
        // Only a click on the backdrop itself closes; a click inside the dialog
        // bubbles up with a different target.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">{title}</h1>
          <button
            type="button"
            onClick={close}
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
