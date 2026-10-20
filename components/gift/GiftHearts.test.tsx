// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { BURST_MS, GLOW_MS, GiftHearts, SHOW_AFTER_MS, makeHearts } from "@/components/gift/GiftHearts";
import { HEARTS_MIN_GAP_MS, readHeartsShownAt, shouldShowHearts, writeHeartsShownAt } from "@/lib/gift/client/hearts-schedule";

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: reduced && query.includes("reduce"), addEventListener: () => {}, removeEventListener: () => {} }),
  });
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

const hearts = () => document.querySelectorAll("[data-heart]").length;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setReducedMotion(false);
  window.history.replaceState(null, "", "/today");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shouldShowHearts", () => {
  it("shows the first time, then not within the gap, then by chance", () => {
    const now = Date.UTC(2026, 9, 20, 12);
    expect(shouldShowHearts(null, now, 0.99)).toBe(true);
    expect(shouldShowHearts(now - HEARTS_MIN_GAP_MS + 60_000, now, 0)).toBe(false);
    expect(shouldShowHearts(now - HEARTS_MIN_GAP_MS, now, 0.1)).toBe(true);
    expect(shouldShowHearts(now - HEARTS_MIN_GAP_MS, now, 0.9)).toBe(false);
  });

  it("remembers per account", () => {
    writeHeartsShownAt("account-1", 1234);
    expect(readHeartsShownAt("account-1")).toBe(1234);
    expect(readHeartsShownAt("account-2")).toBeNull();
  });
});

describe("makeHearts", () => {
  it("makes a burst of hearts across the screen, staggered", () => {
    const made = makeHearts();
    expect(made).toHaveLength(26);
    expect(made.every((h) => h.left >= 12 && h.left <= 88 && h.size >= 20 && h.size <= 46)).toBe(true);
    expect(made[0].delay).toBeLessThan(made[made.length - 1].delay);
  });
});

describe("GiftHearts", () => {
  it("floats hearts a moment after the first opening, then takes them away", () => {
    render(<GiftHearts accountId="account-1" enabled />);
    expect(screen.queryByTestId("gift-hearts")).toBeNull();

    act(() => vi.advanceTimersByTime(SHOW_AFTER_MS));
    expect(hearts()).toBe(26);
    expect(screen.getByTestId("gift-hearts").getAttribute("aria-hidden")).toBe("true");
    expect(readHeartsShownAt("account-1")).not.toBeNull();

    act(() => vi.advanceTimersByTime(BURST_MS));
    expect(screen.queryByTestId("gift-hearts")).toBeNull();
  });

  it("doesn't show them again on the next opening soon after", () => {
    writeHeartsShownAt("account-1", Date.now() - 60_000);
    render(<GiftHearts accountId="account-1" enabled />);
    act(() => vi.advanceTimersByTime(SHOW_AFTER_MS));
    expect(screen.queryByTestId("gift-hearts")).toBeNull();
  });

  it("shows nothing for anyone the server didn't name", () => {
    render(<GiftHearts accountId="account-1" enabled={false} />);
    act(() => vi.advanceTimersByTime(SHOW_AFTER_MS));
    expect(screen.queryByTestId("gift-hearts")).toBeNull();
    expect(readHeartsShownAt("account-1")).toBeNull();
  });

  it("counts coming back after half an hour as opening the app again", () => {
    writeHeartsShownAt("account-1", Date.now() - HEARTS_MIN_GAP_MS - 1);
    vi.spyOn(Math, "random").mockReturnValue(0.9); // not this time…
    render(<GiftHearts accountId="account-1" enabled />);
    act(() => vi.advanceTimersByTime(SHOW_AFTER_MS));
    expect(screen.queryByTestId("gift-hearts")).toBeNull();

    vi.spyOn(Math, "random").mockReturnValue(0.1); // …but on coming back
    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(31 * 60_000));
    act(() => setVisibility("visible"));
    expect(screen.getByTestId("gift-hearts")).toBeTruthy();
  });

  it("shows a preview with ?hearts to anyone, without counting it", () => {
    window.history.replaceState(null, "", "/today?hearts");
    render(<GiftHearts accountId="account-9" enabled={false} />);
    act(() => vi.advanceTimersByTime(SHOW_AFTER_MS));
    expect(hearts()).toBe(26);
    expect(readHeartsShownAt("account-9")).toBeNull();
  });

  it("with reduced motion: one heart that fades in and out, nothing flying", () => {
    setReducedMotion(true);
    render(<GiftHearts accountId="account-1" enabled />);
    act(() => vi.advanceTimersByTime(SHOW_AFTER_MS));
    expect(hearts()).toBe(0);
    expect(screen.getByTestId("gift-hearts").querySelectorAll("svg")).toHaveLength(1);
    act(() => vi.advanceTimersByTime(GLOW_MS));
    expect(screen.queryByTestId("gift-hearts")).toBeNull();
  });
});
