"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";

type IconProps = { className?: string };

/** A navigation entry: where it points, and which label it renders. */
type NavItem = {
  href: string;
  label: MessageKey;
  Icon: (props: IconProps) => ReactNode;
};

function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 10.5 12 3.5l9 7" />
      <path d="M5.5 9.5V20h13V9.5" />
    </svg>
  );
}

function RoutinesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function WorkoutsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
    </svg>
  );
}

function ProgressIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15l3.5-4 3 2.5L19 8" />
    </svg>
  );
}

function ExercisesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/* Labels are keys into the shared `nav.*` vocabulary, shared with the desktop
   sidebar so the two bars can never drift apart. */
const ITEMS: NavItem[] = [
  { href: "/", label: "nav.home", Icon: HomeIcon },
  { href: "/routines", label: "nav.routines", Icon: RoutinesIcon },
  { href: "/workouts", label: "nav.workouts", Icon: WorkoutsIcon },
  { href: "/progress", label: "nav.progress", Icon: ProgressIcon },
  { href: "/exercises", label: "nav.exercises", Icon: ExercisesIcon },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Mobile-only primary navigation. Hidden on the workout detail route, where the
 * active logger owns the bottom of the screen with its own controls.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  if (/^\/workouts\/[^/]+/.test(pathname)) return null;

  return (
    <nav
      aria-label={t("nav.primary")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[var(--app-safe-bottom)] pl-[var(--app-safe-left)] pr-[var(--app-safe-right)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] ${
                  active ? "text-zinc-900" : "text-zinc-500"
                }`}
              >
                <Icon className={`h-6 w-6 ${active ? "text-zinc-900" : "text-zinc-400"}`} />
                <span className="truncate">{t(label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
