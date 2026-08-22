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

  it("calls onSubmit with the trimmed name once filled in, and null expiry/batch when the ordinary (non-scan) path is used", () => {
    const onSubmit = vi.fn();
    render(<ManualEntryForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/όνομα φαρμάκου/i), { target: { value: "  Παρακεταμόλη  " } });
    fireEvent.click(screen.getByRole("button", { name: /συνέχεια/i }));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Παρακεταμόλη", expiry: null, batch: null });
  });

  it("does not show the expiry/batch fields when there's nothing scanned to pre-fill", () => {
    render(<ManualEntryForm onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText(/ημερομηνία λήξης/i)).toBeNull();
    expect(screen.queryByLabelText(/παρτίδα/i)).toBeNull();
  });

  it("pre-fills expiry/batch from a scan fallback (Phase 3 Journey 3) and includes any edits in onSubmit", () => {
    const onSubmit = vi.fn();
    render(<ManualEntryForm onSubmit={onSubmit} initialExpiry="2026-12-31" initialBatch="LOT42" />);

    expect(screen.getByLabelText(/ημερομηνία λήξης/i)).toHaveValue("2026-12-31");
    expect(screen.getByLabelText(/παρτίδα/i)).toHaveValue("LOT42");

    fireEvent.change(screen.getByLabelText(/όνομα φαρμάκου/i), { target: { value: "Ιβουπροφένη" } });
    fireEvent.change(screen.getByLabelText(/παρτίδα/i), { target: { value: "LOT43" } });
    fireEvent.click(screen.getByRole("button", { name: /συνέχεια/i }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "Ιβουπροφένη", expiry: "2026-12-31", batch: "LOT43" });
  });
});
