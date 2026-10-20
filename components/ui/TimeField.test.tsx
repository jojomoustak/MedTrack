// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

const { TimeField } = await import("@/components/ui/TimeField");

afterEach(cleanup);

function Harness({ initial = "", onValue }: { initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <TimeField
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
      label="Ώρα δόσης 1"
      suggestion="08:00"
    />
  );
}

// Owner-reported 2026-10-20: «the clock needs redesigning» (it was the phone's own clock dialog).
describe("TimeField", () => {
  it("shows no time until one is chosen", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Ώρα δόσης 1: χωρίς ώρα" })).toBeTruthy();
    expect(screen.getByText("Επιλέξτε ώρα")).toBeTruthy();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("opens on its suggested time, with an hour and a minute wheel", () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: /Ώρα δόσης 1/ }));

    expect(onValue).toHaveBeenLastCalledWith("08:00");
    const [hours, minutes] = screen.getAllByRole("spinbutton");
    expect(hours.getAttribute("aria-valuetext")).toBe("08");
    expect(minutes.getAttribute("aria-valuetext")).toBe("00");
  });

  it("any minute can be picked: the arrow keys step, a tap picks", () => {
    const onValue = vi.fn();
    render(<Harness initial="18:00" onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: "Ώρα δόσης 1: 18:00" }));
    const [hours, minutes] = screen.getAllByRole("spinbutton");

    // The wheel turns past the end, so each number is there more than once.
    fireEvent.click(screen.getAllByText("57")[0]);
    expect(onValue).toHaveBeenLastCalledWith("18:57");

    fireEvent.keyDown(hours, { key: "ArrowDown" });
    expect(onValue).toHaveBeenLastCalledWith("19:57");
    fireEvent.keyDown(minutes, { key: "ArrowDown" });
    fireEvent.keyDown(minutes, { key: "ArrowDown" });
    fireEvent.keyDown(minutes, { key: "ArrowDown" });
    expect(onValue).toHaveBeenLastCalledWith("19:00");
  });

  it("names the part of the day beside the time", () => {
    render(<Harness initial="20:30" />);
    expect(screen.getByText("Βράδυ")).toBeTruthy();
    cleanup();
    render(<Harness initial="07:15" />);
    expect(screen.getByText("Πρωί")).toBeTruthy();
  });

  it("turns past the end: down from 59 is 00, up from 00 is 23", () => {
    const onValue = vi.fn();
    render(<Harness initial="00:59" onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: "Ώρα δόσης 1: 00:59" }));
    const [hours, minutes] = screen.getAllByRole("spinbutton");

    fireEvent.keyDown(minutes, { key: "ArrowDown" });
    expect(onValue).toHaveBeenLastCalledWith("00:00");
    fireEvent.keyDown(hours, { key: "ArrowUp" });
    expect(onValue).toHaveBeenLastCalledWith("23:00");
  });

  it("«Έτοιμο» closes it, keeping the time", () => {
    render(<Harness initial="07:30" />);
    fireEvent.click(screen.getByRole("button", { name: "Ώρα δόσης 1: 07:30" }));
    fireEvent.click(screen.getByRole("button", { name: "Έτοιμο" }));
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("button", { name: "Ώρα δόσης 1: 07:30" })).toBeTruthy();
  });
});
