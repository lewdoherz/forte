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
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
});

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
