"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";

export type NavigationIconName = "home" | "workout" | "profile" | "routines" | "history" | "progress" | "exercises" | "settings";

export function NavigationIcon({ name, className }: { name: NavigationIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {name === "home" ? <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h14V9M9 21v-7h6v7" /></> : null}
      {name === "workout" ? <path d="M3 9v6m4-8v10m10-10v10m4-8v6M7 12h10" /> : null}
      {name === "profile" ? <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></> : null}
      {name === "routines" ? <><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></> : null}
      {name === "history" ? <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7" /><path d="M12 7v5l3 2" /></> : null}
      {name === "progress" ? <><path d="M4 5v14h16" /><path d="m8 15 4-5 3 2 5-6" /></> : null}
      {name === "exercises" ? <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></> : null}
      {name === "settings" ? <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="var(--bg-surface)" /><circle cx="15" cy="17" r="3" fill="var(--bg-surface)" /></> : null}
    </svg>
  );
}

type NavItem = { href: string; label: MessageKey; icon: NavigationIconName };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "nav.home", icon: "home" },
  { href: "/workout", label: "nav.workout", icon: "workout" },
  { href: "/profile", label: "nav.profile", icon: "profile" },
];

export function isNavigationActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname === "/workouts" || pathname.startsWith("/workouts/");
  if (href === "/workout") return pathname === href || pathname === "/routines" || pathname.startsWith("/routines/");
  if (href === "/profile") return ["/profile", "/progress", "/exercises", "/account"].some((route) => pathname === route || pathname.startsWith(`${route}/`));
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The app frame hides this bar only while the active logger owns the screen. */
export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("nav.primary")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--nav-backdrop)] pb-[var(--app-safe-bottom)] pl-[var(--app-safe-left)] pr-[var(--app-safe-right)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {PRIMARY_NAV.map(({ href, label, icon }) => {
          const active = isNavigationActive(pathname, href);
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 px-2 py-2 text-xs font-medium ${
                  active ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"
                } focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--accent-text)]`}
              >
                <NavigationIcon name={icon} className="h-6 w-6" />
                <span className="max-w-full truncate">{t(label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
