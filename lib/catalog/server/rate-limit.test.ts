import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitForTests, isRateLimited } from "@/lib/catalog/server/rate-limit";

describe("isRateLimited", () => {
  beforeEach(() => {
    __resetRateLimitForTests();
  });

  it("allows requests under the limit", () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      expect(isRateLimited("account-1", now)).toBe(false);
    }
  });

  it("blocks requests once the per-window limit is exceeded", () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) isRateLimited("account-1", now);
    expect(isRateLimited("account-1", now)).toBe(true);
  });

  it("tracks each key independently", () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) isRateLimited("account-1", now);
    expect(isRateLimited("account-1", now)).toBe(true);
    expect(isRateLimited("account-2", now)).toBe(false);
  });

  it("resets once the window has elapsed", () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) isRateLimited("account-1", now);
    expect(isRateLimited("account-1", now)).toBe(true);
    expect(isRateLimited("account-1", now + 11_000)).toBe(false);
  });
});
