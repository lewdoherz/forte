import { betterAuth } from "better-auth";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import type { Kysely } from "kysely";
import type { Database } from "@/lib/db";
import { env, isProductionRuntime } from "./env";

/** Development-only fallback; production must set BETTER_AUTH_SECRET. */
const DEV_AUTH_SECRET = "forte-dev-secret";

/**
 * Better Auth mapped onto the application's `app_user` table (single identity:
 * user.id == app_user.id == owner_id/user_id). `database` is the app's Kysely
 * instance. Raw SQL migrations remain the schema authority, so runtime schema
 * validation is disabled in favour of schema/tests/verify-auth.ts.
 */
export function createAuth(instance: Kysely<Database>) {
  // The development fallback below must never apply in production.
  // assertProductionEnv() rejects a missing secret at server start; this is the
  // second line of defence for any code path that builds the auth instance first.
  if (isProductionRuntime && !env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required in production — see .env.example.");
  }

  return betterAuth({
    database: kyselyAdapter(instance, { type: "postgres" }),
    secret: env.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET,
    // Absolute origin used for callbacks and redirects. Left undefined locally
    // so Better Auth derives it from the incoming request; required in
    // production by assertProductionEnv().
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true },
    user: {
      modelName: "app_user",
      fields: {
        name: "display_name",
        email: "email",
        emailVerified: "email_verified",
        image: "profile_pic_url",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    session: {
      modelName: "session",
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    account: {
      modelName: "account",
      fields: {
        userId: "user_id",
        accountId: "account_id",
        providerId: "provider_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      modelName: "verification",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    rateLimit: {
      // Enabled in production by the framework default (window 10s, max 100) —
      // deliberately not overridden, so development stays unlimited.
      //
      // The store is moved off the in-process default so limits survive a deploy
      // and are shared between instances; the table comes from 0009.
      storage: "database",
      modelName: "rate_limit",
      fields: { key: "key", count: "count", lastRequest: "last_request" },
      window: 60,
      max: 100,
      customRules: {
        // Password endpoints need a credential policy, not a traffic policy: the
        // global allowance is far too generous for guessing a password.
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    advanced: {
      database: {
        generateId: "uuid",
        validateSchema: false,
      },
      // Forwarded headers are only trusted when the deployment actually sits
      // behind a proxy, and only for the addresses it sits behind.
      //
      // Both failure modes are real: with no trusted proxies Better Auth accepts
      // a single-value X-Forwarded-For from anyone, so a caller can mint a fresh
      // bucket per request and never be limited; and it refuses a multi-hop chain
      // outright, which makes every caller share one bucket, so a single abusive
      // client can lock everyone out. Which of those you get depends on topology,
      // which is why this is configuration and not a guess — see
      // TRUSTED_PROXY_CIDRS.
      ...(env.TRUSTED_PROXY_CIDRS
        ? { ipAddress: { trustedProxies: env.TRUSTED_PROXY_CIDRS } }
        : {}),
    },
  });
}
