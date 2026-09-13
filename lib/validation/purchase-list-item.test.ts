import { describe, expect, it } from "vitest";
import { createPurchaseListItemSchema, updatePurchaseListItemSchema } from "@/lib/validation/purchase-list-item";

function validCreateInput(overrides: Partial<Parameters<typeof createPurchaseListItemSchema.parse>[0]> = {}) {
  return {
    id: crypto.randomUUID(),
    clientMutationId: crypto.randomUUID(),
    purchaseListId: crypto.randomUUID(),
    label: "Vitamin D",
    ...overrides,
  };
}

describe("createPurchaseListItemSchema", () => {
  it("accepts an item with only a label", () => {
    expect(() => createPurchaseListItemSchema.parse(validCreateInput())).not.toThrow();
  });

  it("accepts an item with only a userMedicationId", () => {
    expect(() => createPurchaseListItemSchema.parse(validCreateInput({ label: undefined, userMedicationId: crypto.randomUUID() }))).not.toThrow();
  });

  it("rejects an item with neither a label nor a userMedicationId (chk_item_has_label)", () => {
    expect(() => createPurchaseListItemSchema.parse(validCreateInput({ label: undefined }))).toThrow();
  });

  it("defaults currency to EUR when omitted", () => {
    const parsed = createPurchaseListItemSchema.parse(validCreateInput());
    expect(parsed.currency).toBe("EUR");
  });
});

describe("updatePurchaseListItemSchema", () => {
  it("leaves currency undefined when the caller doesn't send it — must not silently default to EUR on a partial patch", () => {
    const parsed = updatePurchaseListItemSchema.parse({ estimatedUnitPriceCents: 500 });
    expect(parsed).toEqual({ estimatedUnitPriceCents: 500 });
    expect(parsed.currency).toBeUndefined();
  });

  it("accepts a status transition with purchasedAt", () => {
    const purchasedAt = new Date().toISOString();
    const parsed = updatePurchaseListItemSchema.parse({ status: "purchased", purchasedAt });
    expect(parsed.status).toBe("purchased");
    expect(parsed.purchasedAt).toBe(purchasedAt);
  });

  it("accepts clearing purchasedAt back to null (reopening a purchased item)", () => {
    const parsed = updatePurchaseListItemSchema.parse({ status: "pending", purchasedAt: null });
    expect(parsed.purchasedAt).toBeNull();
  });
});
