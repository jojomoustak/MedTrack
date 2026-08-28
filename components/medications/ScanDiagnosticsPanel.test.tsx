// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ScanDiagnosticsPanel, type ScanDiagnostics } from "@/components/medications/ScanDiagnosticsPanel";

function makeDiagnostics(overrides: Partial<ScanDiagnostics> = {}): ScanDiagnostics {
  return {
    format: "EAN_13",
    gtin: "05012345678900",
    batch: "LOT9",
    expiry: "2026-12-31",
    serialPresent: true,
    resolutionState: "found",
    matchedIdentifierType: "GTIN",
    matchedProductName: "FLAGYL CAPS 500MG/CAP",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("ScanDiagnosticsPanel (GTIN-resolution task spec §8)", () => {
  it("renders all diagnostic fields outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<ScanDiagnosticsPanel diagnostics={makeDiagnostics()} />);

    expect(screen.getByText("EAN_13")).toBeTruthy();
    expect(screen.getByText("05012345678900")).toBeTruthy();
    expect(screen.getByText("LOT9")).toBeTruthy();
    expect(screen.getByText("2026-12-31")).toBeTruthy();
    expect(screen.getByText("present")).toBeTruthy();
    expect(screen.getByText("found")).toBeTruthy();
    expect(screen.getByText("GTIN")).toBeTruthy();
    expect(screen.getByText("FLAGYL CAPS 500MG/CAP")).toBeTruthy();
  });

  it("NEVER renders the actual serial value, even outside production — presence only (spec §4/§8)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const { container } = render(<ScanDiagnosticsPanel diagnostics={makeDiagnostics({ serialPresent: true })} />);

    expect(screen.getByText("present")).toBeTruthy();
    // The type itself has no field to hold an actual serial value — this
    // assertion also guards against a future accidental regression that
    // adds one and renders it.
    expect(container.textContent).not.toMatch(/SN\d+|serial-\d+/i);
  });

  it("renders nothing at all in production — a true no-op, not just visually hidden (spec §8: 'do not expose... in production')", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { container } = render(<ScanDiagnosticsPanel diagnostics={makeDiagnostics()} />);

    expect(container.innerHTML).toBe("");
    expect(screen.queryByText("EAN_13")).toBeNull();
    expect(screen.queryByText("05012345678900")).toBeNull();
  });

  it("shows an em-dash placeholder for absent fields, never a fabricated value", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<ScanDiagnosticsPanel diagnostics={makeDiagnostics({ batch: null, expiry: null, matchedIdentifierType: null, matchedProductName: null })} />);

    expect(screen.getAllByText("—").length).toBe(4);
  });
});
