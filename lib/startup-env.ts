import { assertProductionEnv, env, isProductionRuntime } from "./env";

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

  // Development has rate limiting disabled, so the client-IP topology cannot
  // matter there and warning about it is pure noise. (It was: this check ran
  // unconditionally, so every `next dev` boot warned about a production setting.)
  if (!isProductionRuntime) return;

  // Not fatal: a deployment without a proxy is legitimate, and refusing to boot
  // would be worse than the risk. But the operator needs to know which failure
  // mode applies, because both are silent.
  //
  // There are two correct topologies, and they need different configuration:
  //   - an appending proxy     -> TRUSTED_PROXY_CIDRS, so the chain can be
  //                               stripped to the first untrusted hop;
  //   - a platform that sets   -> TRUST_FORWARDED_HEADER=true, because the
  //     the header itself          single value is then authoritative.
  // Warning on "no CIDRs" alone would fire on every Vercel deployment, where
  // leaving it unset is correct — and a warning that is usually wrong gets
  // ignored.
  const trustedProxies = env.TRUSTED_PROXY_CIDRS;
  const platformSetsHeader = env.TRUST_FORWARDED_HEADER === true;

  if (trustedProxies && platformSetsHeader) {
    console.warn(
      "[startup] Both TRUSTED_PROXY_CIDRS and TRUST_FORWARDED_HEADER are set. They " +
        "describe different topologies: trusted proxies are used to strip an " +
        "appended X-Forwarded-For chain down to the first untrusted hop, whereas " +
        "TRUST_FORWARDED_HEADER asserts the platform sets the header itself. Set " +
        "whichever matches this deployment and remove the other.",
    );
    return;
  }

  if (!trustedProxies && !platformSetsHeader) {
    console.warn(
      "[startup] The client IP used for rate limiting is not configured. Set " +
        "exactly one of: TRUSTED_PROXY_CIDRS (the addresses of a proxy that " +
        "appends X-Forwarded-For), or TRUST_FORWARDED_HEADER=true (the platform " +
        "sets the header itself and does not forward client-supplied values). " +
        "Getting this wrong is silent either way: without trusted proxy addresses " +
        "a single-value X-Forwarded-For is accepted from any caller, so a client " +
        "can rotate the value and never be limited; and a multi-hop chain is " +
        "refused outright, so every caller shares one bucket and a single abusive " +
        "client can lock everyone out.",
    );
  }
}
