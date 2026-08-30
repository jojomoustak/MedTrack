// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DoseCard } from "@/components/today/DoseCard";
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
    quantityValue: "1",
    quantityUnit: "tablet",
    source: "schedule_generated",
    snoozeCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clientMutationId: "cm-1",
    syncState: "synced",
    ...overrides,
  };
}

describe("DoseCard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows Taken/Skip/Snooze actions for an actionable, non-terminal dose", () => {
    render(<DoseCard dose={makeDose()} medicationName="Ασπιρίνη" actionable onTaken={vi.fn()} onSkipped={vi.fn()} onSnoozed={vi.fn()} />);
    expect(screen.getByRole("button", { name: /έλαβα/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /παράλειψη/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /αναβολή/i })).toBeTruthy();
  });

  it("never shows actions when not actionable, regardless of status", () => {
    render(<DoseCard dose={makeDose()} medicationName="Ασπιρίνη" actionable={false} onTaken={vi.fn()} onSkipped={vi.fn()} onSnoozed={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /έλαβα/i })).toBeNull();
  });

  it("never shows actions on an already-terminal dose (e.g. missed) even when actionable", () => {
    render(<DoseCard dose={makeDose({ status: "missed" })} medicationName="Ασπιρίνη" actionable onTaken={vi.fn()} onSkipped={vi.fn()} onSnoozed={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /έλαβα/i })).toBeNull();
    expect(screen.getByText(/χάθηκε/i)).toBeTruthy();
  });

  it("Taken: does NOT call onTaken immediately -- only after the 5s undo window elapses uninterrupted", () => {
    const onTaken = vi.fn();
    render(<DoseCard dose={makeDose()} medicationName="Ασπιρίνη" actionable onTaken={onTaken} onSkipped={vi.fn()} onSnoozed={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /έλαβα/i }));
    expect(onTaken).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4999);
    expect(onTaken).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTaken).toHaveBeenCalledWith("dose-1");
  });

  it("Undo within the window cancels the action entirely -- onTaken is never called", () => {
    const onTaken = vi.fn();
    render(<DoseCard dose={makeDose()} medicationName="Ασπιρίνη" actionable onTaken={onTaken} onSkipped={vi.fn()} onSnoozed={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /έλαβα/i }));
    fireEvent.click(screen.getByRole("button", { name: /αναίρεση/i }));

    vi.advanceTimersByTime(10_000);
    expect(onTaken).not.toHaveBeenCalled();
    // Actions are back, since the card reverted to its prior non-terminal state.
    expect(screen.getByRole("button", { name: /έλαβα/i })).toBeTruthy();
  });

  it("Skip gets the same 5s undo window as Taken, not a blocking confirmation dialog", () => {
    const onSkipped = vi.fn();
    render(<DoseCard dose={makeDose()} medicationName="Ασπιρίνη" actionable onTaken={vi.fn()} onSkipped={onSkipped} onSnoozed={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /παράλειψη/i }));
    expect(onSkipped).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull(); // no blocking confirm modal

    vi.advanceTimersByTime(5000);
    expect(onSkipped).toHaveBeenCalledWith("dose-1");
  });

  it("Snooze fires immediately -- no undo window, since it's non-terminal and freely repeatable", () => {
    const onSnoozed = vi.fn();
    render(<DoseCard dose={makeDose()} medicationName="Ασπιρίνη" actionable onTaken={vi.fn()} onSkipped={vi.fn()} onSnoozed={onSnoozed} />);

    fireEvent.click(screen.getByRole("button", { name: /αναβολή/i }));
    expect(onSnoozed).toHaveBeenCalledWith("dose-1");
  });

  it("a snoozed dose still shows actions (non-terminal, freely repeatable)", () => {
    render(
      <DoseCard
        dose={makeDose({ status: "snoozed", reminderAt: new Date("2026-09-01T05:15:00.000Z").toISOString() })}
        medicationName="Ασπιρίνη"
        actionable
        onTaken={vi.fn()}
        onSkipped={vi.fn()}
        onSnoozed={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /έλαβα/i })).toBeTruthy();
    expect(screen.getByText(/αναβλήθηκε/i)).toBeTruthy();
  });
});
