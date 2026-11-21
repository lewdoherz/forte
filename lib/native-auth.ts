import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { Kysely } from "kysely";
import { z } from "zod";
import type { Database } from "./db";

const proof = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const platform = z.enum(["android", "ios"]);
function digest(value: string) { return createHash("sha256").update(value).digest("base64url"); }
function identifier(code: string, challenge: string, target: string) {
  return `forte-native:v1:${digest(code)}:${challenge}:${target}`;
}

/** A provider authenticates in the system browser; only a PKCE-bound, expiring,
 * single-use code crosses the deep link. Session tokens never cross a URL or JS. */
export function nativeAuth(instance: Kysely<Database>) {
  return {
    id: "forte-native",
    endpoints: {
      nativeAuthorize: createAuthEndpoint("/native/authorize", {
        method: "GET", query: z.object({ challenge: proof, state: proof, platform }),
        use: [sessionMiddleware],
      }, async (ctx) => {
        const now = new Date();
        const code = randomBytes(32).toString("base64url");
        await instance.deleteFrom("verification").where("identifier", "like", "forte-native:v1:%")
          .where("expires_at", "<=", now).execute();
        await instance.insertInto("verification").values({
          id: randomUUID(), identifier: identifier(code, ctx.query.challenge, ctx.query.platform),
          value: ctx.context.session.user.id, expires_at: new Date(now.getTime() + 60_000),
          created_at: now, updated_at: now,
        }).execute();
        ctx.setHeader("Cache-Control", "no-store");
        ctx.setHeader("Referrer-Policy", "no-referrer");
        throw ctx.redirect(`forte://auth/callback?${new URLSearchParams({ code, state: ctx.query.state })}`);
      }),
      nativeExchange: createAuthEndpoint("/native/exchange", {
        method: "POST", body: z.object({ code: proof, verifier: proof, platform }),
      }, async (ctx) => {
        // Delete+return is atomic across instances. A wrong verifier/platform
        // neither consumes the legitimate code nor creates a session.
        const record = await instance.deleteFrom("verification")
          .where("identifier", "=", identifier(ctx.body.code, digest(ctx.body.verifier), ctx.body.platform))
          .where("expires_at", ">", new Date()).returning("value").executeTakeFirst();
        if (!record) throw new APIError("BAD_REQUEST", { message: "Invalid or expired native authorization" });
        const user = await ctx.context.internalAdapter.findUserById(record.value);
        if (!user) throw new APIError("UNAUTHORIZED");
        const session = await ctx.context.internalAdapter.createSession(user.id);
        if (!session) throw new APIError("INTERNAL_SERVER_ERROR");
        await setSessionCookie(ctx, { session, user });
        ctx.setHeader("Cache-Control", "no-store");
        return ctx.json({ ok: true });
      }),
      nativeCancel: createAuthEndpoint("/native/cancel", {
        method: "GET", query: z.object({ state: proof }),
      }, async (ctx) => {
        ctx.setHeader("Cache-Control", "no-store");
        ctx.setHeader("Referrer-Policy", "no-referrer");
        throw ctx.redirect(`forte://auth/callback?${new URLSearchParams({ error: "cancelled", state: ctx.query.state })}`);
      }),
    },
  } satisfies BetterAuthPlugin;
}
