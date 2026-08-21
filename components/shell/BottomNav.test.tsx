// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

let currentPath = "/today";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));

afterEach(() => cleanup());

describe("BottomNav (Phase 3 §1: 5-tab persistent bottom nav)", () => {
  it("renders all 5 tabs with their Greek labels", async () => {
    const { BottomNav } = await import("@/components/shell/BottomNav");
    render(<BottomNav />);
    for (const label of ["Σήμερα", "Φάρμακα", "Ημερολόγιο", "Λίστες", "Προφίλ"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("marks the current tab with aria-current='page' and no others", async () => {
    currentPath = "/medications";
    const { BottomNav } = await import("@/components/shell/BottomNav");
    render(<BottomNav />);
    expect(screen.getByText("Φάρμακα").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Σήμερα").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("every tab link is a real, functional href (no dead nav items)", async () => {
    currentPath = "/today";
    const { BottomNav } = await import("@/components/shell/BottomNav");
    render(<BottomNav />);
    expect(screen.getByText("Λίστες").closest("a")).toHaveAttribute("href", "/lists");
  });
});
