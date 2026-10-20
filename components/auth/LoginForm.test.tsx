// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

const signInEmail = vi.fn();
vi.mock("@/lib/auth/client/auth-client", () => ({
  authClient: { signIn: { email: (...args: unknown[]) => signInEmail(...args) }, sendVerificationEmail: vi.fn() },
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  signInEmail.mockClear();
});

describe("LoginForm — wrong credentials vs. no connection are distinct messages (Phase 3 §8)", () => {
  it("redirects to /today on successful sign-in", async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    const { LoginForm } = await import("@/components/auth/LoginForm");
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByLabelText("Κωδικός πρόσβασης"), { target: { value: "correct" } });
    fireEvent.click(screen.getByRole("button", { name: /σύνδεση/i }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/today"));
  });

  it("shows a 'wrong credentials' message when the API returns an auth error", async () => {
    signInEmail.mockResolvedValue({ data: null, error: { message: "Invalid email or password" } });
    const { LoginForm } = await import("@/components/auth/LoginForm");
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByLabelText("Κωδικός πρόσβασης"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /σύνδεση/i }));

    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/λανθασμένο/i));
    expect(push).not.toHaveBeenCalled();
  });

  it("an account whose email isn't confirmed yet is told so, with a way to get the link again — not 'wrong password'", async () => {
    signInEmail.mockResolvedValue({ data: null, error: { code: "EMAIL_NOT_VERIFIED", status: 403, message: "Email not verified" } });
    const { LoginForm } = await import("@/components/auth/LoginForm");
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByLabelText("Κωδικός πρόσβασης"), { target: { value: "correct" } });
    fireEvent.click(screen.getByRole("button", { name: /σύνδεση/i }));

    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/δεν έχει επιβεβαιωθεί/i));
    expect(screen.getByRole("alert").textContent).not.toMatch(/λανθασμένο/i);
    expect(screen.getByRole("button", { name: "Στείλτε νέο σύνδεσμο" })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a distinct 'no connection' message (not the wrong-credentials copy) when the request itself throws", async () => {
    signInEmail.mockRejectedValue(new TypeError("Failed to fetch"));
    const { LoginForm } = await import("@/components/auth/LoginForm");
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByLabelText("Κωδικός πρόσβασης"), { target: { value: "whatever" } });
    fireEvent.click(screen.getByRole("button", { name: /σύνδεση/i }));

    await vi.waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const message = screen.getByRole("alert").textContent ?? "";
    expect(message).toMatch(/διαδίκτυο|σύνδεσή/i);
    expect(message).not.toMatch(/λανθασμένο/i);
  });
});
