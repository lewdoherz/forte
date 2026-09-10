import { z } from "zod";

/**
 * Single source of truth for environment configuration.
 *
 * Local development stays zero-config: PGlite and a development-only auth
 * secret are used when nothing is set, so no `.env` is required. Values that
 * ARE present are always validated for shape. Production additionally requires
 * `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` — enforced by
 * `assertProductionEnv()`, which runs once at server start (instrumentation.ts)
 * and again when the database/auth layers initialise.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) => /^postgres(ql)?:\/\//.test(value),
      "must be a postgres:// or postgresql:// connection string",
    )
    .optional(),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "must be at least 32 characters")
    .optional(),
  BETTER_AUTH_URL: z.string().url("must be an absolute URL").optional(),
  TRUSTED_PROXY_CIDRS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        : undefined,
    ),
  /**
   * Declares that the hosting platform sets `x-forwarded-for` itself and does not
   * forward client-supplied values — Vercel, for one, documents that it overwrites
   * the header "to prevent IP spoofing". A single-value header is then
   * authoritative and no proxy addresses are needed.
   *
   * This is a declaration of topology, not a switch: the behaviour it describes is
   * already the default. It exists so a correctly configured deployment is not
   * warned at startup.
   */
  TRUST_FORWARDED_HEADER: z
    .enum(["true", "false"], {
      message: "must be exactly 'true' or 'false'",
    })
    .optional()
    .transform((value) => value === "true"),
});

// Parsed from the whole environment, not from a hand-listed subset of it.
//
// A field declared in the schema but omitted from a manual mapping is silently
// inert — zod strips what it did not see and reports nothing — which is exactly
// how the proxy-trust settings failed to take effect when first added. Passing
// process.env directly makes the schema the only place a variable is declared.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = parsed.data;

/**
 * True only for a live production server. `next build` also sets
 * NODE_ENV=production but serves no traffic and has no environment available,
 * so the build phase is deliberately excluded — otherwise every module-scope
 * check would break the build.
 */
export const isProductionRuntime =
  env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build";

const REQUIRED_IN_PRODUCTION = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
] as const;

/**
 * Fail fast when a production server starts without a complete environment.
 * No-op in development, where the zero-config defaults apply.
 */
export function assertProductionEnv(): void {
  if (!isProductionRuntime) return;

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !env[key]);
  if (missing.length === 0) return;

  throw new Error(
    `Missing required production environment variable(s): ${missing.join(", ")}.\n` +
      "Set them before starting the server — see .env.example for the full list.",
  );
}
