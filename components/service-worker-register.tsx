"use client";

import { useEffect } from "react";

/**
 * Registers the offline worker from the root layout. It renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Production only. In development a worker caches aggressively and serves
    // stale chunks, which breaks hot reload — it would make the app worse to
    // work on than no worker at all.
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        // A failed registration is not fatal — the app still works online — but
        // a missing or misconfigured worker should be visible in the console.
        console.error("[sw] registration failed", error);
      });
    };

    // Wait for load so fetching the worker never competes with the first paint.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
