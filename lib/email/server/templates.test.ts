import { describe, expect, it } from "vitest";
import {
  existingAccountSignUpNoticeEmail,
  passwordResetBlockedPendingVerificationEmail,
  passwordResetEmail,
  verificationEmail,
} from "@/lib/email/server/templates";

// CLAUDE.md rule 8: these are auth-only emails — none of them may ever
// reference a medication/dose/schedule/health concept. Cheap, durable
// regression guard against someone later "helpfully" adding health
// content to an auth template.
const HEALTH_WORDS = ["φάρμακ", "δόσ", "πρόγραμμα λήψ", "medication", "dose", "schedule"];

function assertNoHealthContent(text: string) {
  const lower = text.toLowerCase();
  for (const word of HEALTH_WORDS) {
    expect(lower).not.toContain(word);
  }
}

function assertWellFormed(content: { subject: string; html: string; text: string }) {
  expect(content.subject.length).toBeGreaterThan(0);
  expect(content.html.length).toBeGreaterThan(0);
  expect(content.text.length).toBeGreaterThan(0);
  assertNoHealthContent(content.subject);
  assertNoHealthContent(content.html);
  assertNoHealthContent(content.text);
}

describe("verificationEmail", () => {
  it("is well-formed and includes the verification URL in both bodies", () => {
    const url = "https://example.com/verify-email?token=abc123&callbackURL=%2F";
    const content = verificationEmail({ url });
    assertWellFormed(content);
    expect(content.html).toContain(url);
    expect(content.text).toContain(url);
  });
});

describe("passwordResetEmail", () => {
  it("is well-formed and includes the reset URL in both bodies", () => {
    const url = "https://example.com/reset-password?token=xyz789";
    const content = passwordResetEmail({ url });
    assertWellFormed(content);
    expect(content.html).toContain(url);
    expect(content.text).toContain(url);
  });
});

describe("passwordResetBlockedPendingVerificationEmail", () => {
  it("is well-formed and does not include any token/reset URL (no second token is minted)", () => {
    const content = passwordResetBlockedPendingVerificationEmail();
    assertWellFormed(content);
    expect(content.html).not.toMatch(/https?:\/\//);
    expect(content.text).not.toMatch(/https?:\/\//);
  });
});

describe("existingAccountSignUpNoticeEmail", () => {
  it("is well-formed", () => {
    const content = existingAccountSignUpNoticeEmail();
    assertWellFormed(content);
  });
});
