import type { Instrumentation } from "next";
import { log } from "./lib/log";

/**
 * Next.js instrumentation hook — runs once when a server instance starts (both
 * `next dev` and `next start`), before any request is served. This is the
 * fail-fast point for environment configuration.
 *
 * It deliberately does not apply during `next build`: the build phase also sets
 * NODE_ENV=production but has no runtime environment and serves no traffic, so
 * `lib/env.ts` excludes that phase.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Dynamic import is required, not stylistic: the enforcement module calls
  // `process.exit`, which the edge-runtime compiler rejects, and this file is
  // compiled for both runtimes. Only this Node.js branch may reference it.
  const { enforceProductionEnv } = await import("./lib/startup-env");
  enforceProductionEnv();
}

/**
 * Server-side error reporting seam, invoked whenever the server captures an
 * error.
 *
 * The `digest` logged here is the same value the error boundaries show the
 * user, which is what makes a user-quoted reference findable in the logs.
 *
 * The error MESSAGE is intentionally not logged. Framework and driver errors
 * carry SQL text, bound parameters and — for connection failures — the
 * connection string, and those must never be copied into a log line. Next.js
 * already emits the full error server-side for operators; this entry exists to
 * make it correlatable to what the user saw.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  // Narrowed with `in`, mirroring the framework's own example, rather than
  // asserting a fabricated shape onto an unknown value.
  const digest =
    typeof error === "object" && error !== null && "digest" in error && error.digest
      ? String(error.digest)
      : undefined;

  log.error("request.error", {
    digest,
    name: error instanceof Error ? error.name : typeof error,
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
