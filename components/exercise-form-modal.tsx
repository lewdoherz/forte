"use client";

import { useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";

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

  return (
    <Modal title={title} onClose={close}>
      {children}
    </Modal>
  );
}
