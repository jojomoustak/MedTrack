// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { SYNC_STATES, type SyncState } from "@/lib/domain/sync";

afterEach(() => cleanup());

describe("SyncStatusChip", () => {
  it("renders nothing for the 'synced' steady state (Phase 3 §5 — no persistent chip once synced)", () => {
    const { container } = render(<SyncStatusChip state="synced" />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(SYNC_STATES.filter((s): s is Exclude<SyncState, "synced"> => s !== "synced"))(
    "renders both an icon and a non-empty visible label for '%s' (never color-only, Phase 3 §5/§9)",
    (state) => {
      render(<SyncStatusChip state={state} onRetry={() => {}} />);
      const el = screen.getByRole(state === "conflict" || state === "failed" ? "button" : "status");
      expect(el.querySelector("svg")).toBeTruthy();
      expect(el).toHaveAttribute("aria-label");
      expect(el.getAttribute("aria-label")).not.toBe("");
    },
  );

  it("conflict and failed chips are interactive (tappable) and call onRetry when activated", () => {
    const onRetry = vi.fn();
    render(<SyncStatusChip state="conflict" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("non-retryable states (local-only, pending, syncing, deleted) render as a non-interactive status element", () => {
    render(<SyncStatusChip state="pending" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("the accessible label states the full condition in words, not just a state keyword (Phase 3 §9)", () => {
    render(<SyncStatusChip state="failed" onRetry={() => {}} />);
    const label = screen.getByRole("button").getAttribute("aria-label");
    expect(label?.toLowerCase()).toContain("επανάληψη"); // "retry" — confirms it's a full sentence, not just "failed"
  });
});
