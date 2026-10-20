// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CatalogProduct } from "@/lib/domain/catalog";

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

const { DetailsStep } = await import("@/components/medications/DetailsStep");

afterEach(cleanup);

function renderManual() {
  const onSubmit = vi.fn();
  render(<DetailsStep catalogProduct={null} manualName="Lactiferon" onSubmit={onSubmit} />);
  return onSubmit;
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: "Συνέχεια" }));

// Owner-reported 2026-10-20: «Δισκίο» was asked twice, as the form and again as the stock unit.
describe("DetailsStep — the stock unit follows the form", () => {
  it("isn't asked again: picking a form sets the stock unit to it", () => {
    const onSubmit = renderManual();
    expect(screen.queryByLabelText("Μονάδα αποθέματος")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Κάψουλα" }));
    expect(screen.getByText("Κάψουλα", { selector: "span" })).toBeTruthy();
    submit();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ form: "capsule", inventoryUnit: "capsule" }));
  });

  it("can still be set to something else, which then stays when the form changes", () => {
    const onSubmit = renderManual();
    fireEvent.click(screen.getByRole("radio", { name: "Σταγόνες" }));
    fireEvent.click(screen.getByRole("button", { name: "Αλλαγή" }));
    fireEvent.change(screen.getByLabelText("Μονάδα αποθέματος"), { target: { value: "ml" } });
    fireEvent.click(screen.getByRole("radio", { name: "Σπρέι" }));
    submit();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ form: "spray", inventoryUnit: "ml" }));
  });

  it("a catalog medicine's form and stock unit come from the catalog name", () => {
    const onSubmit = vi.fn();
    const syrup = { id: "p-1", name: "ALGOFREN SYR 100MG/5ML FLx150 ML", form: null, strengthValue: null, strengthUnit: null } as unknown as CatalogProduct;
    render(<DetailsStep catalogProduct={syrup} manualName={null} onSubmit={onSubmit} />);

    expect(screen.getByRole("radio", { name: "ml" }).getAttribute("aria-checked")).toBe("true");
    submit();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ form: "ml", inventoryUnit: "ml" }));
  });

  it("opening the choice without changing it still follows the form", () => {
    const onSubmit = renderManual();
    fireEvent.click(screen.getByRole("button", { name: "Αλλαγή" }));
    fireEvent.click(screen.getByRole("radio", { name: "Φακελάκι" }));
    submit();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ form: "sachet", inventoryUnit: "sachet" }));
  });
});
