// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

const { FormPicker } = await import("@/components/medications/FormPicker");

afterEach(cleanup);

// Owner-reported 2026-10-20: forms and units were one jumbled grid.
describe("FormPicker", () => {
  it("offers the nine forms, liquids and creams by their everyday names", () => {
    render(<FormPicker value={null} onChange={vi.fn()} />);
    const names = screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"));
    expect(names).toEqual(["Δισκίο", "Κάψουλα", "Σιρόπι (ml)", "Σταγόνες", "Σπρέι", "Φακελάκι", "Κρέμα (g)", "Επίθεμα", "Ένεση"]);
  });

  it("keeps the measures behind «Άλλη μορφή»", () => {
    const onChange = vi.fn();
    render(<FormPicker value={null} onChange={onChange} />);
    expect(screen.queryByRole("radio", { name: "mcg" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Άλλη μορφή/ }));
    fireEvent.click(screen.getByRole("radio", { name: "mcg" }));
    expect(onChange).toHaveBeenCalledWith("mcg");
  });

  it("opens with the measures showing when one of them is the current choice", () => {
    render(<FormPicker value="dose" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Δόση" }).getAttribute("aria-checked")).toBe("true");
  });
});
