// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TodayDoseRow, UNDO_WINDOW_MS } from "@/components/today/TodayDoseRow";
import type { DoseEventRecord } from "@/lib/domain/dose-event";

afterEach(() => cleanup());

function makeDose(overrides: Partial<DoseEventRecord> = {}): DoseEventRecord {
  return {
    id: "dose-1",
    profileId: "profile-1",
    userMedicationId: "med-1",
    scheduleId: "schedule-1",
    scheduledAt: new Date("2026-09-01T05:00:00.000Z").toISOString(),
    reminderAt: null,
    takenAt: null,
    status: "scheduled",
    quantityValue: "1.000",
    quantityUnit: "tablet",
    source: "schedule_generated",
    snoozeCount: 0,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clientMutationId: "cm-1",
    syncState: "synced",
    ...overrides,
  };
}

const takeButton = () => screen.queryByRole("button", { name: /σήμανση ως ελήφθη/i });

describe("TodayDoseRow", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows name with strength, and quantity with time", () => {
    render(<TodayDoseRow dose={makeDose()} medicationName="Metformin" medicationStrength="500 mg" onTake={vi.fn()} />);
    expect(screen.getByText("Metformin 500 mg")).toBeTruthy();
    expect(screen.getByText(/1 δισκίο • /)).toBeTruthy();
  });

  it("records taken only after the undo window closes uninterrupted", () => {
    const onTake = vi.fn();
    render(<TodayDoseRow dose={makeDose()} medicationName="Metformin" onTake={onTake} />);

    fireEvent.click(takeButton()!);
    expect(onTake).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Αναίρεση" })).toBeTruthy();

    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS));
    expect(onTake).toHaveBeenCalledExactlyOnceWith("dose-1", "taken");
  });

  it("Undo inside the window records nothing, then or later", () => {
    const onTake = vi.fn();
    const { unmount } = render(<TodayDoseRow dose={makeDose()} medicationName="Metformin" onTake={onTake} />);

    fireEvent.click(takeButton()!);
    fireEvent.click(screen.getByRole("button", { name: "Αναίρεση" }));
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS * 2));
    unmount();
    expect(onTake).not.toHaveBeenCalled();
    expect(takeButton()).toBeNull();
  });

  it("commits a pending tap if the row unmounts inside the window (user navigated away)", () => {
    const onTake = vi.fn();
    const { unmount } = render(<TodayDoseRow dose={makeDose()} medicationName="Metformin" onTake={onTake} />);

    fireEvent.click(takeButton()!);
    unmount();
    expect(onTake).toHaveBeenCalledExactlyOnceWith("dose-1", "taken");
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS));
    expect(onTake).toHaveBeenCalledTimes(1);
  });

  it("offers no take action on a dose already recorded", () => {
    render(<TodayDoseRow dose={makeDose({ status: "taken", takenAt: new Date().toISOString() })} medicationName="Metformin" onTake={vi.fn()} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/^Ελήφθη /)).toBeTruthy();
  });

  it("lets a missed dose be recorded as taken late only where allowed", () => {
    const onTake = vi.fn();
    const { rerender } = render(<TodayDoseRow dose={makeDose({ status: "missed" })} medicationName="Metformin" onTake={onTake} />);
    expect(screen.queryByRole("button", { name: /το πήρα αργότερα/i })).toBeNull();

    rerender(<TodayDoseRow dose={makeDose({ status: "missed" })} medicationName="Metformin" onTake={onTake} allowTakenLate />);
    fireEvent.click(screen.getByRole("button", { name: /το πήρα αργότερα/i }));
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS));
    expect(onTake).toHaveBeenCalledExactlyOnceWith("dose-1", "taken_late");
  });

  it("links the row to the dose's detail screen", () => {
    render(<TodayDoseRow dose={makeDose()} medicationName="Metformin" onTake={vi.fn()} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/calendar/dose/dose-1");
  });
});
