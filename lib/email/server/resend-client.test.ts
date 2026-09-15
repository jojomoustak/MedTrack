import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetEnvCacheForTests } from "@/lib/config/env";
import { ConfigError } from "@/lib/errors/app-error";

// `vi.hoisted()` (not a bare module-scope `const`) because `vi.mock`'s
// factory below is hoisted above this file's imports/declarations —
// referencing a plain `const` from inside it hits the TDZ. This is
// Vitest's documented pattern for mocking a class with an inspectable
// inner method.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  // A regular `function`, not an arrow function — Vitest requires a
  // non-arrow implementation for a mock that's invoked via `new` (arrow
  // functions can never be constructors, and `vi.fn()` mocks preserve that
  // distinction from whatever implementation they're given).
  Resend: vi.fn().mockImplementation(function Resend() {
    return { emails: { send: sendMock } };
  }),
}));

// Imported AFTER the mock so this binding is the mocked wrapper.
import { __resetResendClientForTests, sendEmail } from "@/lib/email/server/resend-client";

const INPUT = { to: "someone@example.com", subject: "Subject", html: "<p>hi</p>", text: "hi" };

beforeEach(() => {
  sendMock.mockReset();
  __resetResendClientForTests();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  // `getEnv()` validates the WHOLE config schema, not just this module's
  // own fields — `vitest.setup.mts`'s baseline doesn't include these (same
  // reason `lib/medications/server/photo.test.ts` sets them itself).
  process.env.GOOGLE_CLIENT_ID ??= "test-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
  process.env.ACCOUNT_ID_HASH_PEPPER ??= "test-pepper-at-least-32-characters-long";
  __resetEnvCacheForTests();
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  __resetEnvCacheForTests();
});

describe("sendEmail", () => {
  it("fails closed with a ConfigError (never a silent no-op) when RESEND_API_KEY/EMAIL_FROM aren't set", async () => {
    await expect(sendEmail(INPUT)).rejects.toBeInstanceOf(ConfigError);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("fails closed when only one of the two required vars is set", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    __resetEnvCacheForTests();
    await expect(sendEmail(INPUT)).rejects.toBeInstanceOf(ConfigError);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("calls the Resend SDK with from/to/subject/html/text once fully configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "MedTracking <noreply@example.com>";
    __resetEnvCacheForTests();
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null });

    await sendEmail(INPUT);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      from: "MedTracking <noreply@example.com>",
      to: INPUT.to,
      subject: INPUT.subject,
      html: INPUT.html,
      text: INPUT.text,
    });
  });

  it("throws when Resend reports an error, and never leaks the recipient address in the thrown message", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "MedTracking <noreply@example.com>";
    __resetEnvCacheForTests();
    sendMock.mockResolvedValue({ data: null, error: { name: "invalid_from_address", statusCode: 422, message: "some detail" } });

    await expect(sendEmail(INPUT)).rejects.toThrow();
    const err = (await sendEmail(INPUT).catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain(INPUT.to);
  });
});
