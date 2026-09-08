// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MobilePlatformUnavailableError, type MobilePlatform } from "@/lib/platform/mobile-platform";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const signInSocial = vi.fn();
const linkSocial = vi.fn();
vi.mock("@/lib/auth/client/auth-client", () => ({
  authClient: {
    signIn: { social: (...args: unknown[]) => signInSocial(...args) },
    linkSocial: (...args: unknown[]) => linkSocial(...args),
  },
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  signInSocial.mockClear();
  linkSocial.mockClear();
});

function fakePlatform(overrides: Partial<MobilePlatform> = {}): MobilePlatform {
  return {
    isAvailable: () => false,
    scanBarcode: vi.fn(),
    recognizePackageText: vi.fn(),
    requestReminderPermission: vi.fn(),
    upsertReminder: vi.fn(),
    cancelRemindersForDoseEvent: vi.fn(),
    signInWithGoogle: vi.fn(),
    ...overrides,
  };
}

describe("GoogleAuthButton — plain browser (no native shell)", () => {
  it("calls signIn.social with the redirect-flow params, in sign-in mode", async () => {
    const { GoogleAuthButton } = await import("@/components/auth/GoogleAuthButton");
    signInSocial.mockResolvedValue({ data: null, error: null });
    render(<GoogleAuthButton mode="sign-in" callbackURL="/today" errorCallbackURL="/login" platform={fakePlatform()} />);

    fireEvent.click(screen.getByRole("button"));

    await vi.waitFor(() => expect(signInSocial).toHaveBeenCalledWith({ provider: "google", callbackURL: "/today", errorCallbackURL: "/login" }));
    expect(linkSocial).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled(); // the real redirect flow navigates the browser itself, never through router.push
  });

  it("calls linkSocial (not signIn.social) in link mode", async () => {
    const { GoogleAuthButton } = await import("@/components/auth/GoogleAuthButton");
    linkSocial.mockResolvedValue({ data: null, error: null });
    render(<GoogleAuthButton mode="link" callbackURL="/profile" platform={fakePlatform()} />);

    fireEvent.click(screen.getByRole("button"));

    await vi.waitFor(() => expect(linkSocial).toHaveBeenCalledWith({ provider: "google", callbackURL: "/profile" }));
    expect(signInSocial).not.toHaveBeenCalled();
  });
});

describe("GoogleAuthButton — inside Median (native Google Sign-In)", () => {
  it("on success, completes sign-in via idToken and navigates to callbackURL", async () => {
    const { GoogleAuthButton } = await import("@/components/auth/GoogleAuthButton");
    const platform = fakePlatform({
      isAvailable: () => true,
      signInWithGoogle: vi.fn().mockResolvedValue({ status: "ok", idToken: "fake-jwt" }),
    });
    signInSocial.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    render(<GoogleAuthButton mode="sign-in" callbackURL="/today" errorCallbackURL="/login" platform={platform} />);

    fireEvent.click(screen.getByRole("button"));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/today"));
    expect(signInSocial).toHaveBeenCalledWith({
      provider: "google",
      idToken: { token: "fake-jwt" },
      callbackURL: "/today",
      errorCallbackURL: "/login",
    });
  });

  it("uses linkSocial with idToken in link mode", async () => {
    const { GoogleAuthButton } = await import("@/components/auth/GoogleAuthButton");
    const platform = fakePlatform({
      isAvailable: () => true,
      signInWithGoogle: vi.fn().mockResolvedValue({ status: "ok", idToken: "fake-jwt" }),
    });
    linkSocial.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    render(<GoogleAuthButton mode="link" callbackURL="/profile" platform={platform} />);

    fireEvent.click(screen.getByRole("button"));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/profile"));
    expect(linkSocial).toHaveBeenCalledWith({ provider: "google", idToken: { token: "fake-jwt" }, callbackURL: "/profile" });
    expect(signInSocial).not.toHaveBeenCalled();
  });

  it("shows an error and never calls authClient when native sign-in itself fails/cancels", async () => {
    const { GoogleAuthButton } = await import("@/components/auth/GoogleAuthButton");
    const platform = fakePlatform({
      isAvailable: () => true,
      signInWithGoogle: vi.fn().mockResolvedValue({ status: "error", message: "User cancelled" }),
    });
    render(<GoogleAuthButton mode="sign-in" callbackURL="/today" platform={platform} />);

    fireEvent.click(screen.getByRole("button"));

    await vi.waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(signInSocial).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the account-collision message when Better Auth reports a linked-elsewhere email", async () => {
    const { GoogleAuthButton } = await import("@/components/auth/GoogleAuthButton");
    const platform = fakePlatform({
      isAvailable: () => true,
      signInWithGoogle: vi.fn().mockResolvedValue({ status: "ok", idToken: "fake-jwt" }),
    });
    signInSocial.mockResolvedValue({ data: null, error: { code: "OAUTH_LINK_ERROR", message: "account not linked" } });
    render(<GoogleAuthButton mode="sign-in" callbackURL="/today" platform={platform} />);

    fireEvent.click(screen.getByRole("button"));

    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/υπάρχει ήδη λογαριασμός/i));
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a distinct message when Median's Social Login plugin isn't configured in this build", async () => {
    const { GoogleAuthButton } = await import("@/components/auth/GoogleAuthButton");
    const platform = fakePlatform({
      isAvailable: () => true,
      signInWithGoogle: vi.fn().mockRejectedValue(new MobilePlatformUnavailableError()),
    });
    render(<GoogleAuthButton mode="sign-in" callbackURL="/today" platform={platform} />);

    fireEvent.click(screen.getByRole("button"));

    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/δεν είναι ακόμα διαθέσιμη/i));
    expect(signInSocial).not.toHaveBeenCalled();
  });
});
