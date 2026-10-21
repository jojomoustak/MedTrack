import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetEnvCacheForTests } from "@/lib/config/env";

const { sendMail, createTransport, logError } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })), logError: vi.fn() };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send: vi.fn() } })) }));
vi.mock("@/lib/logging/logger", () => ({ logger: { error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { __resetGmailTransportForTests, normalizeAppPassword } from "@/lib/email/server/gmail-transport";
import { __resetResendClientForTests, sendEmail } from "@/lib/email/server/resend-client";

const INPUT = {
  to: "someone@example.com",
  subject: "Επιβεβαιώστε το email σας",
  html: "<p>hi</p>",
  text: "hi",
  attachments: [{ filename: "medtrack.png", content: "iVBORw0KGgo=", contentId: "medtrack-logo", contentType: "image/png" }],
};

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID ??= "test-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
  process.env.ACCOUNT_ID_HASH_PEPPER ??= "test-pepper-at-least-32-characters-long";
  process.env.GMAIL_USER = "medtrack.app@example.com";
  process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
  __resetEnvCacheForTests();
  __resetGmailTransportForTests();
  __resetResendClientForTests();
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  __resetEnvCacheForTests();
});

// Owner, 2026-10-21: Resend without a bought domain only reached the owner.
describe("sending through Gmail", () => {
  it("is used when configured, even with Resend set too, from «MedTrack» at the Gmail address", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@example.com";
    __resetEnvCacheForTests();
    sendMail.mockResolvedValue({ messageId: "m1" });

    await sendEmail(INPUT);

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: "medtrack.app@example.com", pass: "abcdefghijklmnop" } }));
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: "MedTrack", address: "medtrack.app@example.com" },
        to: INPUT.to,
        subject: INPUT.subject,
        attachments: [{ filename: "medtrack.png", content: Buffer.from("iVBORw0KGgo=", "base64"), cid: "medtrack-logo", contentType: "image/png" }],
      }),
    );
  });

  it("a failure is logged by its code only — never the recipient or Gmail's message — and reported", async () => {
    sendMail.mockRejectedValue(Object.assign(new Error("Invalid login for medtrack.app@example.com sending to someone@example.com"), { code: "EAUTH", responseCode: 535 }));

    await expect(sendEmail(INPUT)).rejects.toThrow("Η αποστολή email απέτυχε.");
    expect(logError).toHaveBeenCalledWith("email.send.failed", { transport: "gmail", errorCode: "EAUTH", statusCode: 535 });
    expect(JSON.stringify(logError.mock.calls)).not.toContain("@example.com");
  });

  it("an app password copied with Google's spaces still works", () => {
    expect(normalizeAppPassword("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
  });
});
