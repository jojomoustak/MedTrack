import { describe, expect, it } from "vitest";
import {
  existingAccountSignUpNoticeEmail,
  passwordResetEmail,
  verificationEmail,
} from "@/lib/email/server/templates";
import { LOGO_CONTENT_ID } from "@/lib/email/server/logo-png";
import type { EmailContent } from "@/lib/email/server/templates";

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

function assertWellFormed(content: EmailContent) {
  expect(content.subject.length).toBeGreaterThan(0);
  expect(content.html.length).toBeGreaterThan(0);
  expect(content.text.length).toBeGreaterThan(0);
  assertNoHealthContent(content.subject);
  assertNoHealthContent(content.html);
  assertNoHealthContent(content.text);
  // The logo the HTML shows travels with the email, never fetched from a server.
  expect(content.html).toContain(`src="cid:${LOGO_CONTENT_ID}"`);
  expect(content.attachments).toEqual([expect.objectContaining({ contentId: LOGO_CONTENT_ID, contentType: "image/png" })]);
}

describe("verificationEmail", () => {
  it("is well-formed and includes the verification URL in both bodies", () => {
    const url = "https://example.com/verify-email?token=abc123&callbackURL=%2F";
    const content = verificationEmail({ url });
    assertWellFormed(content);
    // In HTML the link's "&" is written "&amp;" (what a browser reads back as "&").
    expect(content.html).toContain(url.replace(/&/g, "&amp;"));
    expect(content.html).not.toContain("&callbackURL");
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

describe("existingAccountSignUpNoticeEmail", () => {
  it("is well-formed and carries no link (it's unasked-for mail: nothing to click)", () => {
    const content = existingAccountSignUpNoticeEmail();
    assertWellFormed(content);
    expect(content.html).not.toMatch(/https?:\/\//);
    expect(content.text).not.toMatch(/https?:\/\//);
  });
});
