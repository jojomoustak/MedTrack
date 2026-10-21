// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WEEKDAY_BIT } from "@/lib/domain/medication-schedule";
import { LANGUAGE_STORAGE_KEY } from "@/lib/i18n/language";

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

const { WallClockScheduleBuilder, describeDays } = await import("@/components/medications/WallClockScheduleBuilder");

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const days = (...names: (keyof typeof WEEKDAY_BIT)[]) => names.reduce((mask, name) => mask | (1 << WEEKDAY_BIT[name]), 0);

describe("describeDays — the chosen days read back in words", () => {
  it("lists them Monday first, joined the Greek way", () => {
    expect(describeDays(days("friday", "monday", "wednesday"))).toBe("Κάθε Δευτέρα, Τετάρτη και Παρασκευή");
    expect(describeDays(days("thursday"))).toBe("Κάθε Πέμπτη");
  });

  it("says the usual sets plainly", () => {
    expect(describeDays(days("monday", "tuesday", "wednesday", "thursday", "friday"))).toBe("Δευτέρα έως Παρασκευή");
    expect(describeDays(days("saturday", "sunday"))).toBe("Κάθε Σάββατο και Κυριακή");
  });

  it("asks for a day when none is chosen", () => {
    expect(describeDays(0)).toBe("Πατήστε τις μέρες που χρειάζεστε.");
  });

  it("reads them back in English too", () => {
    expect(describeDays(days("friday", "monday", "wednesday"), "en")).toBe("Every Monday, Wednesday and Friday");
    expect(describeDays(days("thursday"), "en")).toBe("Every Thursday");
    expect(describeDays(days("saturday", "sunday"), "en")).toBe("Every Saturday and Sunday");
  });
});

describe("WallClockScheduleBuilder — «Ορισμένες μέρες»", () => {
  it("shows the days, reads the choice back, and submits it", () => {
    const onSubmit = vi.fn();
    render(<WallClockScheduleBuilder onSubmit={onSubmit} onBack={vi.fn()} initial={{ timesOfDay: ["08:00"], weekdaysMask: null }} />);

    fireEvent.click(screen.getByRole("tab", { name: "Ορισμένες μέρες" }));
    fireEvent.click(screen.getByRole("button", { name: "Δευτέρα" }));
    fireEvent.click(screen.getByRole("button", { name: "Πέμπτη" }));

    expect(screen.getByText("Κάθε Δευτέρα και Πέμπτη")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Συνέχεια" }));
    expect(onSubmit).toHaveBeenCalledWith({ timesOfDay: ["08:00"], weekdaysMask: days("monday", "thursday") });
  });

  it("in English, the same days in English", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    render(<WallClockScheduleBuilder onSubmit={vi.fn()} onBack={vi.fn()} initial={{ timesOfDay: ["08:00"], weekdaysMask: null }} />);

    fireEvent.click(screen.getByRole("tab", { name: "Certain days" }));
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));
    fireEvent.click(screen.getByRole("button", { name: "Thursday" }));

    expect(screen.getByRole("button", { name: "Monday" }).textContent).toBe("Mo");
    expect(screen.getByText("Every Monday and Thursday")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });
});
