import { describe, expect, it } from "vitest";
import { stripSessionTokens } from "@/lib/auth/strip-session-tokens";

describe("stripSessionTokens", () => {
  it("removes session.token from a /get-session body, keeping everything else", () => {
    const body = { session: { id: "s1", token: "raw", expiresAt: "2027-01-01" }, user: { id: "u1", name: "Γιάννης" } };
    expect(stripSessionTokens(body)).toEqual({ session: { id: "s1", expiresAt: "2027-01-01" }, user: { id: "u1", name: "Γιάννης" } });
  });

  it("removes the top-level token from sign-in / sign-up bodies", () => {
    expect(stripSessionTokens({ redirect: false, token: "raw", user: { id: "u1" } })).toEqual({ redirect: false, user: { id: "u1" } });
  });

  it("returns the very same object when there is no token, so the response is left alone", () => {
    const body = { status: true };
    expect(stripSessionTokens(body)).toBe(body);
  });

  it("leaves non-objects alone", () => {
    expect(stripSessionTokens(null)).toBeNull();
    expect(stripSessionTokens("text")).toBe("text");
    const list = [{ token: "x" }];
    expect(stripSessionTokens(list)).toBe(list);
  });
});
