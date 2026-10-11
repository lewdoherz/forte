import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Repository-specific guidance lives in AGENTS.md; do not generate competing files.
  agentRules: false,
  // PGlite loads a WASM binary at runtime; keep it out of the server bundle.
  // better-auth and its Kysely adapter use dynamic imports, so keep them
  // external too.
  serverExternalPackages: [
    "@electric-sql/pglite",
    "better-auth",
    "@better-auth/kysely-adapter",
  ],
};

export default nextConfig;
