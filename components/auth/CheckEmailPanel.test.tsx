// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

const signInEmail = vi.fn();
const sendVerificationEmail = vi.fn();
vi.mock("@/lib/auth/client/auth-client", () => ({
  authClient: {
    signIn: { email: (...args: unknown[]) => signInEmail(...args) },
    sendVerificationEmail: (...args: unknown[]) => sendVerificationEmail(...args),
  },
}));

const { CheckEmailPanel } = await import("@/components/auth/CheckEmailPanel");

afterEach(() => {
  cleanup();
  push.mockClear();
  signInEmail.mockReset();
  sendVerificationEmail.mockReset();
});

const NOT_VERIFIED = { data: null, error: { code: "EMAIL_NOT_VERIFIED", status: 403 } };
const WRONG_PASSWORD = { data: null, error: { code: "INVALID_EMAIL_OR_PASSWORD", status: 401 } };

function renderPanel() {
  render(<CheckEmailPanel email="maria@example.com" password="correct-horse-battery" onChangeEmail={vi.fn()} />);
}

/** What the phone does when the person comes back from their email app. */
async function comeBack() {
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("CheckEmailPanel", () => {
  it("«Συνέχεια» before the link is opened says it isn't confirmed yet, and stays", async () => {
    signInEmail.mockResolvedValue(NOT_VERIFIED);
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Συνέχεια" }));

    expect(await screen.findByText(/δεν έχει επιβεβαιωθεί ακόμα/i)).toBeTruthy();
    expect(signInEmail).toHaveBeenCalledWith({ email: "maria@example.com", password: "correct-horse-battery" });
    expect(push).not.toHaveBeenCalled();
  });

  it("signs in by itself on coming back once the email is confirmed, straight to Today", async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    renderPanel();

    await comeBack();

    expect(push).toHaveBeenCalledWith("/today");
  });

  it("coming back before confirming stays quiet (no message for a try the person didn't ask for)", async () => {
    signInEmail.mockResolvedValue(NOT_VERIFIED);
    renderPanel();

    await comeBack();

    expect(signInEmail).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stops trying by itself after a refused password (it would count toward that account's lockout)", async () => {
    signInEmail.mockResolvedValue(WRONG_PASSWORD);
    renderPanel();

    await comeBack();
    await comeBack();
    await comeBack();

    expect(signInEmail).toHaveBeenCalledTimes(1);
  });

  it("a refused password on «Συνέχεια» points to the sign-in screen", async () => {
    signInEmail.mockResolvedValue(WRONG_PASSWORD);
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Συνέχεια" }));

    expect(await screen.findByRole("link", { name: /οθόνη σύνδεσης/i })).toBeTruthy();
  });

  it("sends the link again on request, then rests the button", async () => {
    sendVerificationEmail.mockResolvedValue({ data: { status: true }, error: null });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Στείλτε νέο σύνδεσμο" }));

    expect(await screen.findByText(/στείλαμε νέο σύνδεσμο/i)).toBeTruthy();
    expect(sendVerificationEmail).toHaveBeenCalledWith({ email: "maria@example.com", callbackURL: "/email-verified" });
    expect((screen.getByRole("button", { name: "Στάλθηκε ξανά" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
