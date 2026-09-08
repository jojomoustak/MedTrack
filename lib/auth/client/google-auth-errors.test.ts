import { describe, expect, it } from "vitest";
import { mapGoogleAuthError, mapGoogleAuthErrorFromNativeSignIn } from "@/lib/auth/client/google-auth-errors";

describe("mapGoogleAuthError", () => {
  it("returns null when no error code is present", () => {
    expect(mapGoogleAuthError(null)).toBeNull();
  });

  it("maps account_not_linked to the account-collision message", () => {
    expect(mapGoogleAuthError("account_not_linked")).toContain("Υπάρχει ήδη λογαριασμός");
  });

  it("maps unable_to_link_account to the same account-collision message", () => {
    expect(mapGoogleAuthError("unable_to_link_account")).toContain("Υπάρχει ήδη λογαριασμός");
  });

  it("maps an unrecognized code to the generic message", () => {
    expect(mapGoogleAuthError("some_other_error")).toBe("Η σύνδεση με Google απέτυχε. Δοκιμάστε ξανά.");
  });
});

describe("mapGoogleAuthErrorFromNativeSignIn", () => {
  it("maps a message containing 'not linked' to the account-collision message", () => {
    expect(mapGoogleAuthErrorFromNativeSignIn({ code: "OAUTH_LINK_ERROR", message: "account not linked" })).toContain("Υπάρχει ήδη λογαριασμός");
  });

  it("is case-insensitive", () => {
    expect(mapGoogleAuthErrorFromNativeSignIn({ message: "Account Not Linked" })).toContain("Υπάρχει ήδη λογαριασμός");
  });

  it("returns the generic message for an unrelated error", () => {
    expect(mapGoogleAuthErrorFromNativeSignIn({ code: "INVALID_TOKEN", message: "invalid token" })).toBe("Η σύνδεση με Google απέτυχε. Δοκιμάστε ξανά.");
  });

  it("returns the generic message when there's no error object at all", () => {
    expect(mapGoogleAuthErrorFromNativeSignIn(null)).toBe("Η σύνδεση με Google απέτυχε. Δοκιμάστε ξανά.");
    expect(mapGoogleAuthErrorFromNativeSignIn(undefined)).toBe("Η σύνδεση με Google απέτυχε. Δοκιμάστε ξανά.");
  });
});
