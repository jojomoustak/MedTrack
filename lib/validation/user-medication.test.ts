import { describe, expect, it } from "vitest";
import { createUserMedicationSchema } from "@/lib/validation/user-medication";
import { CATALOG_PRODUCTS_MAX_IDS, catalogProductsQuerySchema, catalogSearchQuerySchema } from "@/lib/validation/catalog";

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

describe("catalogProductsQuerySchema (2026-10-12)", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  it("reads a comma-separated id list, trimmed and without repeats", () => {
    expect(catalogProductsQuerySchema.parse({ ids: ` ${A}, ${B},${A},` }).ids).toEqual([A, B]);
  });

  it("rejects a missing or empty list and anything that isn't an id", () => {
    expect(catalogProductsQuerySchema.safeParse({}).success).toBe(false);
    expect(catalogProductsQuerySchema.safeParse({ ids: " , " }).success).toBe(false);
    expect(catalogProductsQuerySchema.safeParse({ ids: `${A},'; DROP TABLE x;--` }).success).toBe(false);
  });

  it(`caps one request at ${CATALOG_PRODUCTS_MAX_IDS} ids`, () => {
    const ids = Array.from({ length: CATALOG_PRODUCTS_MAX_IDS + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(catalogProductsQuerySchema.safeParse({ ids: ids.slice(0, -1).join(",") }).success).toBe(true);
    expect(catalogProductsQuerySchema.safeParse({ ids: ids.join(",") }).success).toBe(false);
  });
});
