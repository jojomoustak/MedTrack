// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EntryChooser } from "@/components/medications/EntryChooser";

afterEach(() => cleanup());

describe("EntryChooser (Phase 3 §2.4 entry chooser)", () => {
  it("scan is disabled and non-clickable when the native platform reports unavailable", () => {
    const onChoose = vi.fn();
    render(<EntryChooser onChoose={onChoose} scanAvailable={false} />);
    const scanButton = screen.getByRole("button", { name: /σάρωση/i });
    expect(scanButton).toBeDisabled();
    fireEvent.click(scanButton);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("calls onChoose('scan') when Scan is pressed and the platform is available", () => {
    const onChoose = vi.fn();
    render(<EntryChooser onChoose={onChoose} scanAvailable={true} />);
    const scanButton = screen.getByRole("button", { name: /σάρωση/i });
    expect(scanButton).not.toBeDisabled();
    fireEvent.click(scanButton);
    expect(onChoose).toHaveBeenCalledWith("scan");
  });

  it("calls onChoose('search') when Search is pressed", () => {
    const onChoose = vi.fn();
    render(<EntryChooser onChoose={onChoose} scanAvailable={false} />);
    fireEvent.click(screen.getByRole("button", { name: /αναζήτηση/i }));
    expect(onChoose).toHaveBeenCalledWith("search");
  });

  it("calls onChoose('manual') when Manual is pressed", () => {
    const onChoose = vi.fn();
    render(<EntryChooser onChoose={onChoose} scanAvailable={false} />);
    fireEvent.click(screen.getByRole("button", { name: /χειροκίνητη/i }));
    expect(onChoose).toHaveBeenCalledWith("manual");
  });

  it("every option is at least a 48px (min-h-12) touch target (building-accessible-mobile-ui)", () => {
    render(<EntryChooser onChoose={vi.fn()} scanAvailable={false} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toMatch(/min-h-12/);
    }
  });
});
