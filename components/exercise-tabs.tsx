"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type ExerciseTab = {
  /** Stable id used in `?tab=`, and in the ARIA tab/tabpanel wiring. */
  id: string;
  label: string;
  /**
   * The tab's own URL, built on the server so the other query params on the
   * page (the Library panel's filters, the Statistics range) survive a switch
   * and so a tab still works as a plain link.
   */
  href: string;
  /** The already-rendered server component body for this tab. */
  content: ReactNode;
};

/**
 * The exercise page's tab shell.
 *
 * Every panel is rendered by the server and mounted once, then toggled with the
 * `hidden` attribute: switching a tab is a state change, not a navigation, so
 * nothing else on the page (the Library panel's filter fields and scroll, the
 * header, a playing clip) is remounted or refetched. The URL is kept truthful
 * with `history.replaceState`, so switching never adds a history entry for the
 * back button to unwind.
 *
 * The tabs are anchors rather than buttons so the active tab is still reachable
 * without JavaScript: the server reads `?tab=` and marks the matching panel
 * visible on first paint, and a plain click is intercepted only after hydration.
 *
 * Keyboard behaviour follows the ARIA tabs pattern: one tab in the tab order
 * (roving tabindex), arrows/Home/End move the selection, and Enter or Space
 * activates without following the href.
 */
export function ExerciseTabs({
  tabs,
  activeId,
  label = "Exercise sections",
}: {
  tabs: ExerciseTab[];
  /** The initial selection, resolved from `?tab=` on the server. */
  activeId: string;
  label?: string;
}) {
  // `from` records the prop this state came from, so a server navigation that
  // resolves a different `?tab=` — a no-JS tab click, a Statistics range link, a
  // soft navigation from another page — is noticed during render and the local
  // selection follows it rather than diverging from the URL. That is React's
  // documented "adjust state when a prop changes" pattern, and it keeps the
  // first paint on the server's tab without an effect or a second render pass.
  const [selection, setSelection] = useState({ current: activeId, from: activeId });
  if (selection.from !== activeId) setSelection({ current: activeId, from: activeId });
  const selected = selection.current;
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  function select(id: string) {
    setSelection({ current: id, from: activeId });
    const tab = tabs.find((candidate) => candidate.id === id);
    if (tab) window.history.replaceState(null, "", tab.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    const last = tabs.length - 1;
    let next: number;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === " " || event.key === "Spacebar") {
      // Anchors do not activate on Space; the tabs pattern does.
      event.preventDefault();
      select(tabs[index].id);
      return;
    } else return;

    // Automatic activation: the panels are already on the page, so selecting on
    // focus costs nothing and saves the second keypress.
    event.preventDefault();
    select(tabs[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        className="mt-8 flex overflow-x-auto border-b border-zinc-200"
      >
        {tabs.map((tab, index) => {
          const isSelected = tab.id === selected;
          return (
            <a
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              href={tab.href}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={isSelected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={(event) => {
                // A modified or non-primary click belongs to the browser: the
                // href must open the tab in a new tab or window instead of
                // silently switching this page.
                if (
                  event.defaultPrevented ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                select(tab.id);
              }}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`-mb-px flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium ${
                isSelected
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
              }`}
            >
              {tab.label}
            </a>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== selected}
          // The Statistics panel holds no focusable elements, so the panel
          // itself has to be reachable for a keyboard reader to scroll it.
          tabIndex={0}
          className="mt-6 focus:outline-none"
        >
          {tab.content}
        </div>
      ))}
    </>
  );
}
