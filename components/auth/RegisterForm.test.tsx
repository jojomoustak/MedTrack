// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const signUpEmail = vi.fn();
vi.mock("@/lib/auth/client/auth-client", () => ({
  authClient: { signUp: { email: (...args: unknown[]) => signUpEmail(...args) } },
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  signUpEmail.mockClear();
});

describe("RegisterForm", () => {
  it("calls authClient.signUp.email with the form values and redirects to /today on success", async () => {
    signUpEmail.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    const { RegisterForm } = await import("@/components/auth/RegisterForm");
    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText("Όνομα"), { target: { value: "Νίκος" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nikos@example.com" } });
    fireEvent.change(screen.getByLabelText("Κωδικός πρόσβασης"), { target: { value: "correct-horse-battery" } });
    fireEvent.click(screen.getByRole("button", { name: /δημιουργία λογαριασμού/i }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/today"));
    expect(signUpEmail).toHaveBeenCalledWith({ name: "Νίκος", email: "nikos@example.com", password: "correct-horse-battery" });
  });

  it("shows a plain-language, translated error (never the raw server message) and does not redirect on failure", async () => {
    signUpEmail.mockResolvedValue({ data: null, error: { message: "User already exists" } });
    const { RegisterForm } = await import("@/components/auth/RegisterForm");
    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "taken@example.com" } });
    fireEvent.change(screen.getByLabelText("Κωδικός πρόσβασης"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /δημιουργία λογαριασμού/i }));

    await vi.waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).not.toMatch(/already exists/i);
    expect(push).not.toHaveBeenCalled();
  });
});
