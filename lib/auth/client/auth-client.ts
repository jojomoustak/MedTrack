"use client";

/**
 * Better Auth's official client SDK (ADR-003 §"CSRF posture") — every
 * auth mutation (sign-up, sign-in, sign-out) MUST go through this rather
 * than a hand-rolled `fetch` to `/api/auth/...`, since the client SDK is
 * what actually applies Better Auth's origin/CSRF handling correctly.
 * Same-origin app (this client and `app/api/auth/[...all]` are the same
 * Next.js deployment), so no `baseURL` override is needed.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
