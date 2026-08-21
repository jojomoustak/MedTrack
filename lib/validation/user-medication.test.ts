import { describe, expect, it } from "vitest";
import { createUserMedicationSchema } from "@/lib/validation/user-medication";
import { catalogSearchQuerySchema } from "@/lib/validation/catalog";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  clientMutationId: "22222222-2222-4222-8222-222222222222",
  inventoryUnit: "tablet" as const,
};

describe("createUserMedicationSchema (ADR-004: catalog match OR manual name, never neither)", () => {
  it("accepts a manual entry (customName set, catalogProductId null)", () => {
    const result = createUserMedicationSchema.safeParse({
      ...base,
      catalogProductId: null,
      customName: "Παρακεταμόλη",
      customForm: null,
      customStrengthValue: null,
      customStrengthUnit: null,
      treatmentState: "active",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a catalog-linked entry (catalogProductId set, customName null)", () => {
    const result = createUserMedicationSchema.safeParse({
      ...base,
      catalogProductId: "33333333-3333-4333-8333-333333333333",
      customName: null,
      customForm: null,
      customStrengthValue: null,
      customStrengthUnit: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects neither catalogProductId nor customName being set (chk_catalog_or_manual)", () => {
    const result = createUserMedicationSchema.safeParse({
      ...base,
      catalogProductId: null,
      customName: null,
      customForm: null,
      customStrengthValue: null,
      customStrengthUnit: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid inventoryUnit", () => {
    const result = createUserMedicationSchema.safeParse({
      ...base,
      inventoryUnit: "kilograms",
      catalogProductId: null,
      customName: "X",
    });
    expect(result.success).toBe(false);
  });

  it("defaults treatmentState to 'active' and expiryWarningDays to 30 when omitted", () => {
    const result = createUserMedicationSchema.parse({
      ...base,
      catalogProductId: null,
      customName: "X",
      customForm: null,
      customStrengthValue: null,
      customStrengthUnit: null,
    });
    expect(result.treatmentState).toBe("active");
    expect(result.expiryWarningDays).toBe(30);
  });
});

describe("catalogSearchQuerySchema", () => {
  it("requires at least 2 characters", () => {
    expect(catalogSearchQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(catalogSearchQuerySchema.safeParse({ q: "ab" }).success).toBe(true);
  });

  it("defaults limit to 20 and caps it at 50", () => {
    expect(catalogSearchQuerySchema.parse({ q: "test" }).limit).toBe(20);
    expect(catalogSearchQuerySchema.safeParse({ q: "test", limit: 500 }).success).toBe(false);
  });

  it("defaults offset to 0", () => {
    expect(catalogSearchQuerySchema.parse({ q: "test" }).offset).toBe(0);
  });
});
