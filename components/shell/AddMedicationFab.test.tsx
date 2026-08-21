// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

let currentPath = "/today";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));

afterEach(() => cleanup());

describe("AddMedicationFab (Phase 3 §1: visible on Today & Medications only)", () => {
  it("renders on /today", async () => {
    currentPath = "/today";
    const { AddMedicationFab } = await import("@/components/shell/AddMedicationFab");
    render(<AddMedicationFab />);
    expect(screen.getByRole("link", { name: /προσθήκη φαρμάκου/i })).toBeTruthy();
  });

  it("renders on /medications", async () => {
    currentPath = "/medications";
    const { AddMedicationFab } = await import("@/components/shell/AddMedicationFab");
    render(<AddMedicationFab />);
    expect(screen.getByRole("link", { name: /προσθήκη φαρμάκου/i })).toBeTruthy();
  });

  it("does not render on /calendar, /lists, or /profile", async () => {
    for (const path of ["/calendar", "/lists", "/profile"]) {
      currentPath = path;
      const { AddMedicationFab } = await import("@/components/shell/AddMedicationFab");
      const { container, unmount } = render(<AddMedicationFab />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("links to the existing Phase 6 Add Medication flow route", async () => {
    currentPath = "/today";
    const { AddMedicationFab } = await import("@/components/shell/AddMedicationFab");
    render(<AddMedicationFab />);
    expect(screen.getByRole("link", { name: /προσθήκη φαρμάκου/i })).toHaveAttribute("href", "/medications/add");
  });
});
