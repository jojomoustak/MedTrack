// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCameraSystemBars } from "@/lib/platform/system-bars";

type MedianWindow = Window & { median?: unknown };

afterEach(() => {
  delete (window as MedianWindow).median;
});

describe("useCameraSystemBars", () => {
  it("turns both phone bars black while open, and back to the app's cream on leaving", () => {
    const statusbar = { set: vi.fn() };
    const systemNavBar = { set: vi.fn() };
    (window as MedianWindow).median = { statusbar, systemNavBar };

    const { unmount } = renderHook(() => useCameraSystemBars());
    expect(statusbar.set).toHaveBeenLastCalledWith({ color: "000000", style: "dark" });
    expect(systemNavBar.set).toHaveBeenLastCalledWith({ color: "000000", style: "dark" });

    unmount();
    expect(statusbar.set).toHaveBeenLastCalledWith({ color: "F8F5EE", style: "light" });
    expect(systemNavBar.set).toHaveBeenLastCalledWith({ color: "F8F5EE", style: "light" });
  });

  it("restores the bars when the page is left by a full page load", () => {
    const statusbar = { set: vi.fn() };
    (window as MedianWindow).median = { statusbar };

    renderHook(() => useCameraSystemBars());
    window.dispatchEvent(new Event("pagehide"));
    expect(statusbar.set).toHaveBeenLastCalledWith({ color: "F8F5EE", style: "light" });
  });

  it("does nothing in a plain browser", () => {
    expect(() => renderHook(() => useCameraSystemBars()).unmount()).not.toThrow();
  });
});
