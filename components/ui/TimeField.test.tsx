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
    expect(screen.getByText("--:--")).toBeTruthy();
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

    fireEvent.click(screen.getByText("57"));
    expect(onValue).toHaveBeenLastCalledWith("18:57");

    fireEvent.keyDown(hours, { key: "ArrowDown" });
    expect(onValue).toHaveBeenLastCalledWith("19:57");
    fireEvent.keyDown(minutes, { key: "ArrowDown" });
    fireEvent.keyDown(minutes, { key: "ArrowDown" });
    fireEvent.keyDown(minutes, { key: "ArrowDown" });
    expect(onValue).toHaveBeenLastCalledWith("19:00");
  });

  it("«Έτοιμο» closes it, keeping the time", () => {
    render(<Harness initial="07:30" />);
    fireEvent.click(screen.getByRole("button", { name: "Ώρα δόσης 1: 07:30" }));
    fireEvent.click(screen.getByRole("button", { name: "Έτοιμο" }));
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("button", { name: "Ώρα δόσης 1: 07:30" })).toBeTruthy();
  });
});
