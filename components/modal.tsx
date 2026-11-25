"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/context";

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
  variant = "default",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Width/layout classes for the panel; defaults to the form dialog's width. */
  panelClassName?: string;
  variant?: "default" | "training";
}) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focus = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("input,button,select,textarea,a[href]")?.focus());
    return () => {
      cancelAnimationFrame(focus);
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (variant !== "training") return;
    const visual = window.visualViewport;
    const resize = () => setViewport({ height: visual?.height ?? window.innerHeight, top: visual?.offsetTop ?? 0 });
    const task = setTimeout(resize, 0);
    visual?.addEventListener("resize", resize);
    visual?.addEventListener("scroll", resize);
    return () => {
      clearTimeout(task);
      visual?.removeEventListener("resize", resize);
      visual?.removeEventListener("scroll", resize);
    };
  }, [variant]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex='0']") ?? []).filter((element) => element.getClientRects().length > 0);
        const first = elements[0];
        const last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className={variant === "training" ? "training training-dialog-backdrop fixed inset-x-0 z-50 flex items-end justify-center overflow-hidden bg-black/70 p-3 sm:items-center" : "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-4 sm:items-center"}
      style={variant === "training" ? {
        "--dialog-vh": `${viewport?.height ?? 0}px`,
        "--dialog-top": `${viewport?.top ?? 0}px`,
        ...(viewport === null ? { "--dialog-vh": "100dvh" } : {}),
      } as CSSProperties : undefined}
      onClick={(event) => {
        // Only a click on the backdrop itself closes; a click inside the dialog
        // bubbles up with a different target.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full rounded-2xl border p-4 shadow-2xl ${variant === "training" ? "max-h-full overflow-y-auto border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]" : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"} ${panelClassName}`}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-3 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)]"
          >
            {t("common.close")}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
