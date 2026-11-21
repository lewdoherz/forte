"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ForteMark } from "@/components/forte-mark";
import { NavigationIcon, PRIMARY_NAV, isNavigationActive, type NavigationIconName } from "@/components/bottom-nav";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";

const SECONDARY_NAV: { href: string; label: MessageKey; icon: NavigationIconName }[] = [
  { href: "/workouts", label: "nav.history", icon: "history" },
  { href: "/routines", label: "nav.routines", icon: "routines" },
  { href: "/progress", label: "nav.progress", icon: "progress" },
  { href: "/exercises", label: "nav.exercises", icon: "exercises" },
  { href: "/account", label: "nav.settings", icon: "settings" },
];

/** The app frame reserves this rail's width, except on the active logger. */
export function Sidebar({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const initial = displayName.charAt(0).toUpperCase() || "?";


  return (
    <aside className="fixed bottom-[var(--app-safe-bottom)] left-[var(--app-safe-left)] top-[var(--app-safe-top)] z-40 hidden w-52 flex-col overflow-y-auto border-r border-[#34463a] bg-[#0d1512] text-[#eef5ef] sm:flex lg:w-64">
      <Link href="/" className="flex min-h-16 items-center gap-2 px-5 py-4">
        <span className="h-8 w-8 shrink-0 overflow-hidden rounded-md"><ForteMark size={32} /></span>
        <span className="text-lg font-semibold tracking-tight">{t("common.appName")}</span>
      </Link>
      {[
        { label: "nav.primary" as const, items: PRIMARY_NAV, primary: true },
        { label: "nav.secondary" as const, items: SECONDARY_NAV, primary: false },
      ].map(({ label, items, primary }) => (
        <nav key={label} aria-label={t(label)} className={primary ? "flex flex-col gap-1 px-3 py-2" : "mx-3 mt-3 flex flex-col gap-1 border-t border-[#34463a] py-4"}>
          {items.map(({ href, label: itemLabel, icon }) => {
            const active = primary ? isNavigationActive(pathname, href) : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[#d6f077] ${active ? "bg-[#d6f077]/10 text-[#d6f077]" : "text-[#b0c0b4] hover:bg-[#17221c] hover:text-[#eef5ef]"}`}>
                <NavigationIcon name={icon} className="h-5 w-5 shrink-0" />
                <span className="truncate">{t(itemLabel)}</span>
              </Link>
            );
          })}
        </nav>
      ))}
      <div className="mt-auto border-t border-[#34463a] p-3">
        <Link href="/account" className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#17221c]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#34463a] text-sm font-semibold">{initial}</span>
          <span className="truncate text-sm font-medium">{displayName}</span>
        </Link>
      </div>
    </aside>
  );
}
