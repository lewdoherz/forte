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
