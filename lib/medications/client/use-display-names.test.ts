import { describe, expect, it, vi } from "vitest";
import { resolveMedicationDisplayName } from "@/lib/medications/client/use-display-names";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

function makeMed(overrides: Partial<UserMedicationRecord> = {}): UserMedicationRecord {
  return {
    id: "med-1",
    profileId: "profile-1",
    catalogProductId: null,
    customName: null,
    customForm: null,
    customStrengthValue: null,
    customStrengthUnit: null,
    treatmentState: "active",
    inventoryUnit: "tablet",
    lowStockThresholdValue: null,
    expiryWarningDays: 30,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    deletedAt: null,
    clientMutationId: "cmid-1",
    syncState: "synced",
    ...overrides,
  };
}

describe("resolveMedicationDisplayName", () => {
  it("prefers customName when set, without touching either cache", async () => {
    const cache = { get: vi.fn() };
    const offlineIndex = { getById: vi.fn() };
    const name = await resolveMedicationDisplayName(makeMed({ customName: "Depon 500mg" }), cache, offlineIndex);
    expect(name).toBe("Depon 500mg");
    expect(cache.get).not.toHaveBeenCalled();
    expect(offlineIndex.getById).not.toHaveBeenCalled();
  });

  it("returns null for neither a customName nor a catalogProductId", async () => {
    const cache = { get: vi.fn() };
    const offlineIndex = { getById: vi.fn() };
    const name = await resolveMedicationDisplayName(makeMed(), cache, offlineIndex);
    expect(name).toBeNull();
  });

  it("resolves from the catalog cache when it has the product", async () => {
    const cache = { get: vi.fn().mockResolvedValue({ name: "Panadol 500mg" }) };
    const offlineIndex = { getById: vi.fn() };
    const name = await resolveMedicationDisplayName(makeMed({ catalogProductId: "prod-1" }), cache, offlineIndex);
    expect(name).toBe("Panadol 500mg");
    expect(offlineIndex.getById).not.toHaveBeenCalled();
  });

  it("falls back to the offline index when the cache misses", async () => {
    const cache = { get: vi.fn().mockResolvedValue(null) };
    const offlineIndex = { getById: vi.fn().mockResolvedValue({ name: "Aspirin 100mg" }) };
    const name = await resolveMedicationDisplayName(makeMed({ catalogProductId: "prod-1" }), cache, offlineIndex);
    expect(name).toBe("Aspirin 100mg");
  });

  it("returns null when a catalogProductId resolves nowhere (caller supplies the placeholder)", async () => {
    const cache = { get: vi.fn().mockResolvedValue(null) };
    const offlineIndex = { getById: vi.fn().mockResolvedValue(null) };
    const name = await resolveMedicationDisplayName(makeMed({ catalogProductId: "prod-1" }), cache, offlineIndex);
    expect(name).toBeNull();
  });
});
