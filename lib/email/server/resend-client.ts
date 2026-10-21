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
import { BRAND, type EmailAttachment } from "@/lib/email/server/templates";
import { sendWithGmail } from "@/lib/email/server/gmail-transport";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Images the HTML shows in place (`cid:`), e.g. the logo. */
  attachments?: EmailAttachment[];
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

/**
 * Every email is from "MedTrack", whatever name `EMAIL_FROM` carries
 * (owner, 2026-10-20: the inbox said "MedTracking"); only its address is
 * taken from there.
 */
export function senderOf(configured: string): string {
  const address = /<([^>]+)>/.exec(configured)?.[1]?.trim() ?? configured.trim();
  return `${BRAND} <${address}>`;
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

/**
 * Through Gmail when it's configured (`gmail-transport.ts`, 2026-10-21:
 * Resend without a bought domain only reaches its own account holder),
 * otherwise Resend.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const env = getEnv();
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    await sendWithGmail(input, { user: env.GMAIL_USER, appPassword: env.GMAIL_APP_PASSWORD });
    return;
  }

  const { apiKey, from } = assertResendConfigured();
  const client = getResendClient(apiKey);

  const { error } = await client.emails.send({
    from: senderOf(from),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.attachments?.length
      ? {
          attachments: input.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content, "base64"),
            contentId: a.contentId,
            contentType: a.contentType,
          })),
        }
      : {}),
  });

  if (error) {
    logger.error("email.send.failed", { errorName: error.name, statusCode: error.statusCode });
    throw new Error("Η αποστολή email απέτυχε.");
  }
}
