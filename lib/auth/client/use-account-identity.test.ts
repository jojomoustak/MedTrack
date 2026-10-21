// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const useSession = vi.fn();
vi.mock("@/lib/auth/client/auth-client", () => ({ authClient: { useSession: () => useSession() } }));

const { useAccountIdentity } = await import("@/lib/auth/client/use-account-identity");
const { CACHED_ACCOUNT_IDENTITY_KEY, clearCachedProfile } = await import("@/lib/auth/client/use-current-profile");

const MARIA = { name: "Μαρία Παπαδοπούλου", email: "maria@example.com", image: null };

beforeEach(() => localStorage.clear());
afterEach(() => useSession.mockReset());

// Owner-reported 2026-10-21: Profile lost the name and email offline.
describe("useAccountIdentity", () => {
  it("keeps the name and email the session gave, on the phone", () => {
    useSession.mockReturnValue({ data: { user: MARIA } });
    const { result } = renderHook(() => useAccountIdentity());

    expect(result.current).toEqual({ name: "Μαρία Παπαδοπούλου", email: "maria@example.com", image: null });
    expect(JSON.parse(localStorage.getItem(CACHED_ACCOUNT_IDENTITY_KEY)!)).toMatchObject({ name: "Μαρία Παπαδοπούλου", email: "maria@example.com" });
  });

  it("offline (no session answer), shows the ones kept", () => {
    localStorage.setItem(CACHED_ACCOUNT_IDENTITY_KEY, JSON.stringify(MARIA));
    useSession.mockReturnValue({ data: null, error: new Error("Failed to fetch") });
    const { result } = renderHook(() => useAccountIdentity());

    expect(result.current.name).toBe("Μαρία Παπαδοπούλου");
    expect(result.current.email).toBe("maria@example.com");
  });

  it("with nothing kept and no session, shows nothing rather than guessing", () => {
    useSession.mockReturnValue({ data: null });
    const { result } = renderHook(() => useAccountIdentity());
    expect(result.current).toEqual({ name: null, email: null, image: null });
  });

  it("signing out clears them", () => {
    localStorage.setItem(CACHED_ACCOUNT_IDENTITY_KEY, JSON.stringify(MARIA));
    clearCachedProfile();
    expect(localStorage.getItem(CACHED_ACCOUNT_IDENTITY_KEY)).toBeNull();
  });
});
