/**
 * Structured application logging: one JSON object per line, on the console.
 *
 * No dependency, and deliberately no "log this object" helper — callers pass an
 * explicit, already-redacted context. Never pass tokens, passwords, connection
 * strings, full request bodies, or raw driver/framework errors: database errors
 * embed the failing SQL and its bound parameters, and crypto errors can echo
 * key material.
 *
 * `event` is a stable identifier (e.g. "request.error") rather than a human
 * sentence, so entries stay greppable and can be alerted on.
 */
export type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, string | number | boolean | null | undefined>;

function write(level: LogLevel, event: string, context: LogContext): void {
  const entry: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    event,
  };
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined) entry[key] = value;
  }

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, context: LogContext = {}) => write("info", event, context),
  warn: (event: string, context: LogContext = {}) => write("warn", event, context),
  error: (event: string, context: LogContext = {}) => write("error", event, context),
};

/**
 * Records an unexpected failure. `expected` lists the sentinel codes that are
 * normal traffic rather than incidents — an ownership check, a stale page, a
 * workout that was already finished — so real failures are not buried among
 * them.
 *
 * The error MESSAGE is deliberately not recorded; see the module note above.
 * The digest-bearing `request.error` entry from instrumentation.ts carries the
 * detail, and this line records which operation failed.
 */
export function reportFailure(
  action: string,
  error: unknown,
  expected: readonly string[] = [],
): void {
  if (error instanceof Error && expected.includes(error.message)) return;
  write("error", "action.failed", {
    action,
    kind: error instanceof Error ? error.name : typeof error,
  });
}
