"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ForteMark } from "@/components/forte-mark";

type IconProps = { className?: string };

/** The slice of the in-progress workout the sidebar needs to link to it. */
type ActiveWorkout = { id: string; title: string };

/*
 * These icons are deliberately duplicated from `components/bottom-nav.tsx`
 * rather than shared: the mobile nav must stay exactly as it is, so it cannot
 * be changed to export them. They are redrawn here in the same style — 24px
 * grid, 1.8 stroke, round caps/joins, `currentColor`.
 */

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

const ITEMS = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/routines", label: "Routines", Icon: RoutinesIcon },
  { href: "/exercises", label: "Exercises", Icon: ExercisesIcon },
  { href: "/workouts", label: "Workouts", Icon: WorkoutsIcon },
  { href: "/progress", label: "Progress", Icon: ProgressIcon },
];

/**
 * Same rule as the mobile nav: `/` is active only on the dashboard, while every
 * other entry stays active for its own route and anything nested under it.
 */
function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Desktop primary navigation (`sm` and above). Fixed to the left so the content
 * scrolls independently; the layout reserves its width with `sm:pl-64`.
 */
export function Sidebar({
  displayName,
  activeWorkout,
}: {
  displayName: string;
  activeWorkout: ActiveWorkout | null;
}) {
  const pathname = usePathname();
  // There is no per-user avatar (`profile_pic_url` is null), so the account row
  // shows a monogram of the display name instead.
  const initial = displayName.charAt(0).toUpperCase() || "?";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-y-auto border-r border-zinc-200 bg-white sm:flex">
      <Link href="/" className="flex items-center gap-2 px-4 py-4">
        <span className="h-8 w-8 shrink-0 overflow-hidden rounded-md">
          <ForteMark size={32} />
        </span>
        <span className="text-base font-semibold">forte</span>
      </Link>

      <nav aria-label="Primary" className="flex flex-col gap-1 px-2 py-1">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                active
                  ? "bg-sky-100 text-sky-900"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* The sidebar is `sm`-and-up only, so this row is too — a phone keeps the
          resume chip in the top bar, and there is never a second copy. `min-w-0`
          plus `truncate` keeps a long workout title inside the fixed w-64 rail
          instead of widening it. */}
      <div className="mt-auto flex flex-col gap-1 border-t border-zinc-200 p-2">
        {activeWorkout ? (
          <Link
            href={`/workouts/${activeWorkout.id}`}
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg bg-amber-100 px-3 text-sm font-medium text-amber-900 hover:bg-amber-200"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
            <span className="truncate">{activeWorkout.title}</span>
          </Link>
        ) : null}

        <Link
          href="/account"
          className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-100"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-700">
            {initial}
          </span>
          <span className="truncate text-sm font-medium">{displayName}</span>
        </Link>
      </div>
    </aside>
  );
}
