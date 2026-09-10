import { createAuth } from "./auth";
import { db } from "./db";

// Single shared Better Auth instance, used by the route handler and by
// server-side session helpers. The application and auth share the same Kysely
// instance (`db`).
export const auth = createAuth(db);
