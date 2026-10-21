// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

const signUpEmail = vi.fn();
const signInEmail = vi.fn();
vi.mock("@/lib/auth/client/auth-client", () => ({
  authClient: {
    signUp: { email: (...args: unknown[]) => signUpEmail(...args) },
    signIn: { email: (...args: unknown[]) => signInEmail(...args) },
    sendVerificationEmail: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  signUpEmail.mockReset();
  signInEmail.mockReset();
});

function fillAndSubmit(email = "nikos@example.com") {
  fireEvent.change(screen.getByLabelText("Ονοματεπώνυμο"), { target: { value: "Νίκος" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Κωδικός πρόσβασης"), { target: { value: "correct-horse-battery" } });
  fireEvent.click(screen.getByRole("button", { name: /δημιουργία λογαριασμού/i }));
}

describe("Register — the account waits for its email to be confirmed (2026-10-20)", () => {
  it("signs up with the link pointing at /email-verified, then shows «Ελέγξτε το email σας» instead of going to Today", async () => {
    signUpEmail.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    const { RegisterScreen } = await import("@/components/auth/RegisterScreen");
    render(<RegisterScreen />);

    fillAndSubmit("nikos@example.com ");

    expect(await screen.findByRole("heading", { name: "Ελέγξτε το email σας" })).toBeTruthy();
    expect(screen.getByText("nikos@example.com")).toBeTruthy();
    expect(signUpEmail).toHaveBeenCalledWith({ name: "Νίκος", email: "nikos@example.com", password: "correct-horse-battery", callbackURL: "/email-verified" });
    expect(push).not.toHaveBeenCalled();
  });

  it("«Λάθος email; Διορθώστε το» goes back to the form, filled in", async () => {
    signUpEmail.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    const { RegisterScreen } = await import("@/components/auth/RegisterScreen");
    render(<RegisterScreen />);
    fillAndSubmit("nikso@example.com");

    fireEvent.click(await screen.findByRole("button", { name: /λάθος email/i }));

    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("nikso@example.com");
    expect((screen.getByLabelText("Ονοματεπώνυμο") as HTMLInputElement).value).toBe("Νίκος");
  });

  it("shows a plain-language, translated error (never the raw server message) and stays on the form on failure", async () => {
    signUpEmail.mockResolvedValue({ data: null, error: { message: "Something unexpected" } });
    const { RegisterScreen } = await import("@/components/auth/RegisterScreen");
    render(<RegisterScreen />);

    fillAndSubmit();

    await vi.waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).not.toMatch(/unexpected/i);
    expect(screen.queryByRole("heading", { name: "Ελέγξτε το email σας" })).toBeNull();
  });

  it("offers «Συνέχεια με Google» too (owner's request, 2026-10-21)", async () => {
    const { RegisterScreen } = await import("@/components/auth/RegisterScreen");
    render(<RegisterScreen />);
    expect(screen.getByRole("button", { name: /Συνέχεια με Google/ })).toBeTruthy();
  });

  it("says when there's no connection, rather than failing silently", async () => {
    signUpEmail.mockRejectedValue(new TypeError("Failed to fetch"));
    const { RegisterScreen } = await import("@/components/auth/RegisterScreen");
    render(<RegisterScreen />);

    fillAndSubmit();

    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/διαδίκτυο/));
  });
});
