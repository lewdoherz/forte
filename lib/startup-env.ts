import { assertProductionEnv, env } from "./env";

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

  // Not fatal: a deployment without a proxy is legitimate, and refusing to boot
  // would be worse than the risk. But the operator needs to know which of the two
  // failure modes applies, because both are silent.
  if (!env.TRUSTED_PROXY_CIDRS) {
    console.warn(
      "[startup] TRUSTED_PROXY_CIDRS is not set. Rate limiting keys on the client IP, " +
        "which is read from forwarded headers: without trusted proxy addresses a " +
        "single-value X-Forwarded-For is accepted from any caller (so a client can " +
        "rotate the value and never be limited), and a multi-hop chain is refused " +
        "(so every caller shares one bucket and one abusive client can lock everyone " +
        "out). Set it to your proxy's addresses or CIDR ranges before exposing this " +
        "deployment.",
    );
  }
}
