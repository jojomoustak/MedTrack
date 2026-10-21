/**
 * Sending through a Gmail account (owner's choice, 2026-10-21): Resend only
 * delivers to its own account holder until a bought domain is verified, so
 * sign-up confirmations never reached anyone else. Gmail's SMTP with an
 * "app password" is free (about 500 messages a day), delivers to any
 * address, and is signed by Google, so it lands in the inbox.
 *
 * The account is meant to be one made for MedTrack, not someone's personal
 * mailbox: Gmail keeps a copy of everything it sends (reset links
 * included) in "Sent".
 *
 * `GMAIL_USER` / `GMAIL_APP_PASSWORD` (`lib/config/env.ts`) are secrets in
 * Vercel only. As in `resend-client.ts`, neither the recipient nor the
 * message is ever logged, and nodemailer's own error message (which can
 * echo addresses) isn't either — only its stable code.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { BRAND } from "@/lib/email/server/templates";
import { logger } from "@/lib/logging/logger";
import type { SendEmailInput } from "@/lib/email/server/resend-client";

let transport: Transporter | undefined;
let transportKey: string | undefined;

/** Google shows app passwords in groups of four ("abcd efgh ijkl mnop"); the spaces aren't part of it. */
export function normalizeAppPassword(value: string): string {
  return value.replace(/\s+/g, "");
}

function getTransport(user: string, appPassword: string): Transporter {
  const key = `${user}:${appPassword}`;
  if (!transport || transportKey !== key) {
    transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass: appPassword },
      // Sign-up and "forgot password" wait for the send: never for long.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    transportKey = key;
  }
  return transport;
}

/** Test-only: forgets the cached connection settings. */
export function __resetGmailTransportForTests(): void {
  transport = undefined;
  transportKey = undefined;
}

export async function sendWithGmail(input: SendEmailInput, account: { user: string; appPassword: string }): Promise<void> {
  try {
    await getTransport(account.user, normalizeAppPassword(account.appPassword)).sendMail({
      from: { name: BRAND, address: account.user },
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
        cid: a.contentId,
        contentType: a.contentType,
      })),
    });
  } catch (err) {
    const { code, responseCode } = (err ?? {}) as { code?: string; responseCode?: number };
    logger.error("email.send.failed", { transport: "gmail", errorCode: code ?? "unknown", ...(responseCode ? { statusCode: responseCode } : {}) });
    throw new Error("Η αποστολή email απέτυχε.");
  }
}
