import { describe, expect, it } from "vitest";
import { doseQuantityLabel } from "@/lib/medications/dose-quantity-label";

describe("doseQuantityLabel", () => {
  it("uses the singular for one and the plural above one", () => {
    expect(doseQuantityLabel("1.000", "tablet")).toBe("1 δισκίο");
    expect(doseQuantityLabel("2.000", "tablet")).toBe("2 δισκία");
    expect(doseQuantityLabel("3", "capsule")).toBe("3 κάψουλες");
  });

  it("reads a fraction of one as singular", () => {
    expect(doseQuantityLabel("0.500", "tablet")).toBe("0.5 δισκίο");
  });

  it("keeps measurement units as-is and shows a bare amount for an unknown unit", () => {
    expect(doseQuantityLabel("5.000", "ml")).toBe("5 ml");
    expect(doseQuantityLabel("1", "other")).toBe("1");
    expect(doseQuantityLabel("1", null)).toBe("1");
  });

  it("returns null with no quantity", () => {
    expect(doseQuantityLabel(null, "tablet")).toBeNull();
  });
});
