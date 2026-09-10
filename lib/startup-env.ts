import { assertProductionEnv } from "./env";

/**
 * Node.js-only startup enforcement.
 *
 * Kept out of `instrumentation.ts`'s static import graph on purpose: this module
 * calls `process.exit`, which Next's edge-runtime compilation rejects, and the
 * instrumentation hook is compiled for BOTH runtimes. `instrumentation.ts`
 * imports it dynamically inside its `NEXT_RUNTIME === "nodejs"` branch so the
 * edge bundle never contains it.
 */
export function enforceProductionEnv(): void {
  try {
    assertProductionEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    // Next reports a throwing instrumentation hook but leaves the process
    // LISTENING — measured: the port stays open and every request returns 500.
    // A platform health check would then treat a half-configured instance as
    // healthy and route traffic to it, so an incomplete production environment
    // must not be allowed to look alive.
    process.exit(1);
  }
}
