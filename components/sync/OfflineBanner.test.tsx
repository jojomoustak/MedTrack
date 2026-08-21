// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OfflineBanner } from "@/components/sync/OfflineBanner";

afterEach(() => cleanup());

describe("OfflineBanner", () => {
  it("renders nothing when online", () => {
    const { container } = render(<OfflineBanner state="online" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a calm 'you're offline' message, distinct from the backend-unreachable one, when offline", () => {
    render(<OfflineBanner state="offline" />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toMatch(/εκτός σύνδεσης/i);
  });

  it("shows a distinct 'backend unreachable' message (not the same generic text) when online but the server is unreachable (Phase 1 §11)", () => {
    render(<OfflineBanner state="backend-unreachable" />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toMatch(/διακομιστές/i);
    expect(banner.textContent).not.toMatch(/εκτός σύνδεσης/i);
  });

  it("offers a manual retry action only for the backend-unreachable state, not for plain offline", () => {
    const { rerender } = render(<OfflineBanner state="offline" onRetry={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();

    rerender(<OfflineBanner state="backend-unreachable" onRetry={() => {}} />);
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("calls onRetry when the retry button is pressed", () => {
    const onRetry = vi.fn();
    render(<OfflineBanner state="backend-unreachable" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("announces politely via aria-live so screen readers hear it without interrupting", () => {
    render(<OfflineBanner state="offline" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
