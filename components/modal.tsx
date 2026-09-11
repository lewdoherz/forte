"use client";

import { useEffect, type ReactNode } from "react";

/**
 * The app's overlay chrome.
 *
 * One implementation so every dialog dismisses the same way: a backdrop click
 * closes only when it lands on the backdrop itself, Escape closes, and the panel
 * is top-anchored and scrollable on a phone, centred from `sm` up. `panelClassName`
 * carries the width, which is the one thing a caller can meaningfully vary.
 */
export function Modal({
  title,
  onClose,
  children,
  panelClassName = "max-w-xl",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Width/layout classes for the panel; defaults to the form dialog's width. */
  panelClassName?: string;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-4 sm:items-center"
      onClick={(event) => {
        // Only a click on the backdrop itself closes; a click inside the dialog
        // bubbles up with a different target.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full rounded-xl border border-zinc-200 bg-white p-5 shadow-xl ${panelClassName}`}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
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
