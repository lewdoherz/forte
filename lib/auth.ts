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
    advanced: {
      database: {
        generateId: "uuid",
        validateSchema: false,
      },
    },
  });
}
