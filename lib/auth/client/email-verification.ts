/**
 * Where the email-verification link lands (`app/email-verified/page.tsx`).
 * Better Auth appends `?error=<code>` when the link didn't work.
 */
export const EMAIL_VERIFIED_PATH = "/email-verified";

/** ADR-003 §5: "resend available, rate-limited, e.g. 1 per 2 minutes per account". */
export const RESEND_COOLDOWN_MS = 2 * 60 * 1000;
