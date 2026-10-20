// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

const { DateField, daysBetween, parseLocalDate } = await import("@/components/ui/DateField");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 20, 12, 0)); // Tuesday 20 October 2026
});
afterAll(() => vi.useRealTimers());
afterEach(cleanup);

function Harness({ initial = "", min, rangeStart, onValue }: { initial?: string; min?: string; rangeStart?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <DateField
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
      label="Πρώτη μέρα"
      min={min}
      rangeStart={rangeStart}
    />
  );
}

// Owner's request 2026-10-20: «now the calendar in the next step» (it was the phone's own date dialog).
describe("DateField", () => {
  it("says the date in words, «Σήμερα» for today", () => {
    render(<Harness initial="2026-10-20" />);
    expect(screen.getByText("Σήμερα")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Πρώτη μέρα: Τρίτη/ })).toBeTruthy();
  });

  it("opens on the date's month and picks a day from it", () => {
    const onValue = vi.fn();
    render(<Harness initial="2026-10-20" onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: /Πρώτη μέρα/ }));

    expect(screen.getByText(/Οκτώβριος 2026/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Πέμπτη 29 Οκτωβρίου/ }));
    expect(onValue).toHaveBeenLastCalledWith("2026-10-29");
    expect(screen.getByRole("button", { name: /Πρώτη μέρα: Πέμπτη 29 Οκτωβρίου/ })).toBeTruthy();
  });

  it("turns to the next month, and back", () => {
    const onValue = vi.fn();
    render(<Harness initial="2026-10-20" onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: /Πρώτη μέρα/ }));

    fireEvent.click(screen.getByRole("button", { name: "Επόμενος μήνας" }));
    expect(screen.getByText(/Νοέμβριος 2026/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Τρίτη 3 Νοεμβρίου/ }));
    expect(onValue).toHaveBeenLastCalledWith("2026-11-03");
  });

  it("days before `min` can't be picked, and the month before it can't be opened", () => {
    render(<Harness min="2026-10-20" />);
    fireEvent.click(screen.getByRole("button", { name: /Πρώτη μέρα/ }));

    expect((screen.getByRole("button", { name: /Δευτέρα 19 Οκτωβρίου/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Τετάρτη 21 Οκτωβρίου/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Προηγούμενος μήνας" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("with no date yet, asks for one", () => {
    render(<Harness />);
    expect(screen.getByText("Επιλέξτε ημερομηνία")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Πρώτη μέρα: χωρίς ημερομηνία" })).toBeTruthy();
  });
});

describe("date helpers", () => {
  it("reads only real local dates", () => {
    expect(parseLocalDate("2026-10-20")?.getDate()).toBe(20);
    expect(parseLocalDate("2026-02-30")).toBeNull();
    expect(parseLocalDate("")).toBeNull();
  });

  it("counts whole days across the change to winter time", () => {
    expect(daysBetween(new Date(2026, 9, 24), new Date(2026, 9, 26))).toBe(2); // clocks go back on 25 October
  });
});
