import { describe, expect, it, vi } from "vitest";
import { accountGetsHearts, parseGiftEmails } from "@/lib/account/server/gift";

describe("parseGiftEmails", () => {
  it("reads a comma-separated list, trimmed and lowercased, skipping blanks", () => {
    expect(parseGiftEmails(" Friend@Example.com, ,other@example.org ")).toEqual(new Set(["friend@example.com", "other@example.org"]));
    expect(parseGiftEmails(undefined).size).toBe(0);
    expect(parseGiftEmails("").size).toBe(0);
  });
});

describe("accountGetsHearts", () => {
  const emails = new Set(["friend@example.com"]);

  it("is yes for an account whose email is on the list, whatever its case", async () => {
    await expect(accountGetsHearts("account-1", { emails, lookupEmail: async () => "Friend@Example.COM" })).resolves.toBe(true);
  });

  it("is no for anyone else, or an account with no email found", async () => {
    await expect(accountGetsHearts("account-2", { emails, lookupEmail: async () => "someone@example.com" })).resolves.toBe(false);
    await expect(accountGetsHearts("account-3", { emails, lookupEmail: async () => null })).resolves.toBe(false);
  });

  it("doesn't look anyone up when nobody is on the list", async () => {
    const lookupEmail = vi.fn(async () => "friend@example.com");
    await expect(accountGetsHearts("account-1", { emails: new Set(), lookupEmail })).resolves.toBe(false);
    expect(lookupEmail).not.toHaveBeenCalled();
  });

  it("is a quiet no when the lookup fails: signing in never depends on it", async () => {
    await expect(accountGetsHearts("account-1", { emails, lookupEmail: async () => Promise.reject(new Error("db down")) })).resolves.toBe(false);
  });
});
