// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EntryChooser } from "@/components/medications/EntryChooser";

afterEach(() => cleanup());

describe("EntryChooser (Phase 3 §2.4 entry chooser)", () => {
  it("scan is present but disabled (Phase 7-8 territory, not omitted, not clickable)", () => {
    render(<EntryChooser onChoose={vi.fn()} />);
    const scanButton = screen.getByRole("button", { name: /σάρωση/i });
    expect(scanButton).toBeDisabled();
  });

  it("calls onChoose('search') when Search is pressed", () => {
    const onChoose = vi.fn();
    render(<EntryChooser onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: /αναζήτηση/i }));
    expect(onChoose).toHaveBeenCalledWith("search");
  });

  it("calls onChoose('manual') when Manual is pressed", () => {
    const onChoose = vi.fn();
    render(<EntryChooser onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: /χειροκίνητη/i }));
    expect(onChoose).toHaveBeenCalledWith("manual");
  });

  it("every option is at least a 48px (min-h-12) touch target (building-accessible-mobile-ui)", () => {
    render(<EntryChooser onChoose={vi.fn()} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toMatch(/min-h-12/);
    }
  });
});
