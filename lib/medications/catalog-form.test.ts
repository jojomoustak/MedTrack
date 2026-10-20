import { describe, expect, it } from "vitest";
import { catalogMedicationForm } from "@/lib/medications/catalog-form";

// Owner's request 2026-10-20: a catalog medicine's stock unit comes from the catalog.
describe("catalogMedicationForm", () => {
  it("reads the form from an EOF catalog name", () => {
    expect(catalogMedicationForm({ form: null, name: "ALGOFREN F.C.TAB 600MG/TAB BTx20 (BLIST 2x10)" })).toBe("tablet");
    expect(catalogMedicationForm({ form: null, name: "ALGOFREN SYR 100MG/5ML FLx150 ML" })).toBe("ml");
    expect(catalogMedicationForm({ form: null, name: "ALGOFREN EFF.GRAN 400MG/SACHET BTX10 SACHETS" })).toBe("sachet");
    expect(catalogMedicationForm({ form: null, name: "FLAGYL CAPS 500MG/CAP BTX30" })).toBe("capsule");
    expect(catalogMedicationForm({ form: null, name: "ALGOFREN CREAM 10% W/W TUBX100G" })).toBe("g");
  });

  it("prefers the product's own form when it has one", () => {
    expect(catalogMedicationForm({ form: "capsule", name: "SOMETHING F.C.TAB 10MG/TAB" })).toBe("capsule");
  });

  it("is null when the name doesn't say", () => {
    expect(catalogMedicationForm({ form: null, name: "ALGOFREN SUPP 500MG/SUP BT X12" })).toBeNull();
  });
});
