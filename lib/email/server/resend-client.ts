/**
 * Thin `sendEmail()` wrapper around the Resend SDK — the one place in this
 * codebase allowed to import `resend` directly, so every auth-email call
 * site (`lib/auth/config.ts`) goes through the same config/error handling
 * rather than constructing its own `Resend` client.
 *
 * Mirrors `lib/medications/server/photo.ts`'s `assertBlobConfigured()`
 * pattern for `BLOB_READ_WRITE_TOKEN`: `RESEND_API_KEY`/`EMAIL_FROM` are
 * OPTIONAL in `lib/config/env.ts` (this app must still build/run/typecheck
 * for everyone who hasn't set up Resend yet) — this module fails CLOSED
 * with a clear `ConfigError` only at the moment an email is actually sent
 * without them configured, never a silent no-op and never a reason for
 * unrelated routes to fail at `getEnv()` time.
 *
 * CLAUDE.md rule 8 (never log raw health data / PII): the recipient
 * address and email content are never passed to `logger` here — only
 * Resend's own stable, non-PII error `name` (an enum-like code, e.g.
 * `"invalid_from_address"`) and `statusCode` are logged on failure.
 * Resend's `error.message` is deliberately NOT logged: it can echo back
 * caller-supplied field values (e.g. an invalid address) in free text,
 * which `lib/logging/redact.ts`'s key-based denylist would not catch
 * inside a string value.
 */
import { Resend } from "resend";
import { getEnv } from "@/lib/config/env";
import { ConfigError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/logger";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let resendSingleton: Resend | undefined;
let resendSingletonKey: string | undefined;

function assertResendConfigured(): { apiKey: string; from: string } {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new ConfigError("Η αποστολή email δεν έχει ρυθμιστεί ακόμα σε αυτό το περιβάλλον. Δοκιμάστε ξανά αργότερα.");
  }
  return { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM };
}

/** Lazy singleton, re-created only if the configured API key ever changes (e.g. across test runs that swap `process.env`). */
function getResendClient(apiKey: string): Resend {
  if (!resendSingleton || resendSingletonKey !== apiKey) {
    resendSingleton = new Resend(apiKey);
    resendSingletonKey = apiKey;
  }
  return resendSingleton;
}

/** Test-only: clears the cached Resend client so a test can re-validate against a fresh env. */
export function __resetResendClientForTests(): void {
  resendSingleton = undefined;
  resendSingletonKey = undefined;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { apiKey, from } = assertResendConfigured();
  const client = getResendClient(apiKey);

  const { error } = await client.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    logger.error("email.send.failed", { errorName: error.name, statusCode: error.statusCode });
    throw new Error("Η αποστολή email απέτυχε.");
  }
}
