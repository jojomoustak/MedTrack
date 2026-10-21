// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

const { ScheduleDatesReview, describeSpan } = await import("@/components/medications/ScheduleDatesReview");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 20, 1, 30)); // 01:30 on Tuesday 20 October 2026 — in Athens (this machine), still the 19th in UTC
});
afterAll(() => vi.useRealTimers());
afterEach(cleanup);

const BASE = { scheduleKind: "daily" as const, timesOfDay: ["08:00"], weekdaysMask: null, intervalHours: null, anchorAt: null };

describe("describeSpan — the end date read back in words", () => {
  it("counts both days and names the last one", () => {
    expect(describeSpan("2026-10-20", "2026-10-29")).toBe("Για 10 μέρες, ως και την Πέμπτη 29 Οκτωβρίου.");
    expect(describeSpan("2026-10-20", "2026-10-20")).toBe("Για 1 μέρα, ως και την Τρίτη 20 Οκτωβρίου.");
  });

  it("says «το Σάββατο»", () => {
    expect(describeSpan("2026-10-20", "2026-10-24")).toBe("Για 5 μέρες, ως και το Σάββατο 24 Οκτωβρίου.");
  });

  it("says nothing for an end before the start", () => {
    expect(describeSpan("2026-10-20", "2026-10-19")).toBeNull();
  });

  it("reads it back in English too", () => {
    const today = new Date(2026, 9, 20);
    expect(describeSpan("2026-10-20", "2026-10-29", today, "en")).toBe("For 10 days, up to and including Thursday 29 October.");
    expect(describeSpan("2026-10-20", "2026-10-24", today, "en")).toBe("For 5 days, up to and including Saturday 24 October.");
    expect(describeSpan("2026-10-20", "2026-10-20", today, "en")).toBe("For 1 day, up to and including Tuesday 20 October.");
  });
});

describe("ScheduleDatesReview", () => {
  it("starts today on the phone's own date, not UTC's, and has no end until one is asked for", () => {
    const onSubmit = vi.fn();
    render(<ScheduleDatesReview base={BASE} onSubmit={onSubmit} onBack={vi.fn()} />);

    expect(screen.getByText("Σήμερα")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Συνέχεια" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-10-20", endDate: null }));
  });

  it("«Μέχρι μια μέρα» opens the month at once, tints the stretch, reads it back, and submits it", () => {
    const onSubmit = vi.fn();
    render(<ScheduleDatesReview base={BASE} onSubmit={onSubmit} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Μέχρι μια μέρα" }));
    fireEvent.click(screen.getByRole("button", { name: /Πέμπτη 29 Οκτωβρίου/ }));

    expect(screen.getByText("Για 10 μέρες, ως και την Πέμπτη 29 Οκτωβρίου.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Συνέχεια" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-10-20", endDate: "2026-10-29" }));
  });

  it("asks for the last day when none is picked", () => {
    const onSubmit = vi.fn();
    render(<ScheduleDatesReview base={BASE} onSubmit={onSubmit} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Μέχρι μια μέρα" }));
    fireEvent.click(screen.getByRole("button", { name: "Συνέχεια" }));

    expect(screen.getByRole("alert").textContent).toBe("Επιλέξτε την τελευταία μέρα.");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
