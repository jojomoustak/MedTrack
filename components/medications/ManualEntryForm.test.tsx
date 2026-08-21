// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ManualEntryForm } from "@/components/medications/ManualEntryForm";

afterEach(() => cleanup());

describe("ManualEntryForm — the primary, fully-functional path at MVP", () => {
  it("shows a validation error and does not call onSubmit when the name is empty", () => {
    const onSubmit = vi.fn();
    render(<ManualEntryForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /συνέχεια/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("calls onSubmit with the trimmed name once filled in", () => {
    const onSubmit = vi.fn();
    render(<ManualEntryForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/όνομα φαρμάκου/i), { target: { value: "  Παρακεταμόλη  " } });
    fireEvent.click(screen.getByRole("button", { name: /συνέχεια/i }));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Παρακεταμόλη" });
  });
});
