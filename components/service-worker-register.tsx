"use client";

import { useEffect } from "react";

/**
 * Registers the offline worker from the root layout. It renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Production only. In development a worker caches aggressively and serves
    // stale chunks, which breaks hot reload.
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        // A failed registration is not fatal — the app still works online —
        // but a missing or misconfigured worker should be visible.
        console.error("[sw] registration failed", error);
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
