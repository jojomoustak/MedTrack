import { describe, expect, it, vi } from "vitest";

const error = vi.fn();
vi.mock("@/lib/logging/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: (...args: unknown[]) => error(...args) } }));

const { betterAuthLogger } = await import("@/lib/auth/better-auth-logger");

// Security review 2026-10-20: a failed sign-up insert logged the database error, inserted email and name included.
describe("betterAuthLogger", () => {
  it("keeps only the message, with email addresses masked, never the extra arguments", () => {
    (betterAuthLogger.log as (level: "error", message: string, ...args: unknown[]) => void)(
      "error",
      "Failed to create user maria@example.com",
      new Error('insert into "account" values ($1, $2) params: maria@example.com,Μαρία'),
    );

    expect(error).toHaveBeenCalledWith("auth.library", { message: "Failed to create user [email]" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("maria@example.com");
    expect(JSON.stringify(error.mock.calls)).not.toContain("Μαρία");
  });

  it("stays at warn, so Better Auth's info lines (one names the email of an existing account) are never written", () => {
    expect(betterAuthLogger.level).toBe("warn");
  });
});
