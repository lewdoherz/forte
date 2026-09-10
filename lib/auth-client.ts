import { createAuthClient } from "better-auth/client";

// Browser-side client for the sign-in/sign-up forms. It talks to the route
// handler at /api/auth/* on the same origin.
export const authClient = createAuthClient();
