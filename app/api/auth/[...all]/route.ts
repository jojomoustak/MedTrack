/**
 * Better Auth's own catch-all route handler (ADR-003 §"CSRF posture"):
 * every auth mutation (sign-up, sign-in, sign-out, password-reset
 * request/complete) MUST go through this handler, not a hand-rolled
 * Server Action calling `auth.api.*` directly — this is the path where
 * Better Auth's own origin/`trustedOrigins` check is actually enforced.
 *
 * `runtime = "nodejs"` is required (not the default/Edge): Argon2id
 * password hashing (`lib/auth/argon2.ts`) needs Node's built-in
 * `crypto.argon2`, which Edge Functions cannot load (ADR-003).
 */
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/config";

export const runtime = "nodejs";

// Lazy: `getAuth()` (and therefore config validation / DB connection
// setup) only runs on the first actual request, not at module-import
// time — see lib/config/env.ts's doc comment for why that matters for
// `next build`.
const handlers = toNextJsHandler((request: Request) => getAuth().handler(request));

export const { GET, POST } = handlers;
