// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

const { EditMedicationForm, EDIT_MEDICATION_FORM_ID } = await import("@/components/medications/EditMedicationForm");

afterEach(cleanup);

function medication(overrides: Partial<UserMedicationRecord> = {}): UserMedicationRecord {
  return {
    id: "med-1",
    profileId: "profile-1",
    catalogProductId: null,
    customName: "Lactiferon",
    customForm: "tablet",
    customStrengthValue: null,
    customStrengthUnit: null,
    treatmentState: "active",
    inventoryUnit: "tablet",
    lowStockThresholdValue: null,
    expiryWarningDays: 30,
    notes: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    version: 1,
    deletedAt: null,
    clientMutationId: "cm-1",
    syncState: "synced",
    ...overrides,
  };
}

function renderEdit(med: UserMedicationRecord) {
  const onSubmit = vi.fn();
  render(<EditMedicationForm medication={med} displayName={med.customName ?? "FLAGYL"} schedule={null} onSubmit={onSubmit} error={null} />);
  return onSubmit;
}

function save() {
  fireEvent.submit(document.getElementById(EDIT_MEDICATION_FORM_ID)!);
}

// Owner's request 2026-10-20: «Μονάδα αποθέματος» not asked again on the edit screen either.
describe("EditMedicationForm — the stock unit follows the form", () => {
  it("shows the stock unit as one line, not a second question", () => {
    renderEdit(medication());
    expect(screen.getByText("Μονάδα αποθέματος:")).toBeTruthy();
    expect(screen.queryByLabelText("Μονάδα αποθέματος")).toBeNull();
  });

  it("changing the form changes the stock unit with it", () => {
    const onSubmit = renderEdit(medication());
    fireEvent.change(screen.getByLabelText("Μορφή"), { target: { value: "capsule" } });
    save();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ customForm: "capsule", inventoryUnit: "capsule" });
  });

  it("a stock unit that already differs from the form was chosen on purpose, and stays", () => {
    const onSubmit = renderEdit(medication({ customForm: "drop", inventoryUnit: "ml" }));
    fireEvent.change(screen.getByLabelText("Μορφή"), { target: { value: "spray" } });
    save();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ customForm: "spray", inventoryUnit: "ml" });
  });

  it("«Αλλαγή» still lets it be set by hand", () => {
    const onSubmit = renderEdit(medication());
    fireEvent.click(screen.getByRole("button", { name: "Αλλαγή" }));
    fireEvent.change(screen.getByLabelText("Μονάδα αποθέματος"), { target: { value: "dose" } });
    fireEvent.change(screen.getByLabelText("Μορφή"), { target: { value: "spray" } });
    save();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ customForm: "spray", inventoryUnit: "dose" });
  });

  it("a catalog medicine (no form field) still has its stock unit line", () => {
    renderEdit(medication({ catalogProductId: "product-1", customName: null, customForm: null }));
    expect(screen.queryByLabelText("Μορφή")).toBeNull();
    expect(screen.getByRole("button", { name: "Αλλαγή" })).toBeTruthy();
  });
});
