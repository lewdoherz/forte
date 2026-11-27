import { OfflineAppShell } from "@/components/offline-app-shell";

/**
 * Zero-user-data offline app shell.
 *
 * Cached in the service worker's static cache without credentials. When the
 * device cold-launches in airplane mode, the service worker serves this route
 * and the client boots entirely from account-scoped IndexedDB.
 */
export default function OfflineAppPage() {
  return <OfflineAppShell />;
}
