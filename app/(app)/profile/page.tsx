import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { NavigationIcon, type NavigationIconName } from "@/components/bottom-nav";
import type { MessageKey } from "@/lib/i18n";

const SHORTCUTS: { href: string; title: MessageKey; description: MessageKey; icon: NavigationIconName }[] = [
  { href: "/progress", title: "nav.progress", description: "common.profileHub.progress", icon: "progress" },
  { href: "/exercises", title: "nav.exercises", description: "common.profileHub.exercises", icon: "exercises" },
  { href: "/workouts", title: "nav.history", description: "common.profileHub.history", icon: "history" },
  { href: "/account", title: "nav.settings", description: "common.profileHub.settings", icon: "settings" },
];

export default async function ProfilePage() {
  const { t } = await getI18n();
  return (
    <main className="training mx-auto min-w-0 max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t("nav.profile")}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{t("common.profileHub.subtitle")}</p>
      </header>
      <ul className="space-y-3">
        {SHORTCUTS.map(({ href, title, description, icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="training-panel flex min-h-20 min-w-0 items-center gap-4 rounded-2xl p-4 hover:border-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
            >
              <NavigationIcon name={icon} className="h-6 w-6 shrink-0 text-[var(--accent-text)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">{t(title)}</span>
                <span className="mt-1 block break-words text-sm text-[var(--text-muted)]">{t(description)}</span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-[var(--text-muted)]">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
