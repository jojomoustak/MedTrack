// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddMedicationFlow } from "@/components/medications/AddMedicationFlow";
import type { CatalogCacheRepository, CreateUserMedicationInput, UserMedicationRepository } from "@/lib/domain/repositories";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import type { MobilePlatform } from "@/lib/platform/mobile-platform";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";

afterEach(() => cleanup());

function makeFakeRepository() {
  const create = vi.fn(async (input: CreateUserMedicationInput): Promise<UserMedicationRecord> => ({
    ...input,
    treatmentState: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    deletedAt: null,
    syncState: "pending",
  }));
  const repository: UserMedicationRepository = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create,
    applyRemote: vi.fn(),
    markConflict: vi.fn(),
    markFailed: vi.fn(),
  };
  return { repository, create };
}

describe("AddMedicationFlow — manual entry path end to end", () => {
  it("walks entry chooser -> manual form -> details -> review -> creates a UserMedication with catalogProductId null", async () => {
    const { repository, create } = makeFakeRepository();
    const onCreated = vi.fn();
    render(<AddMedicationFlow profileId="profile-1" repository={repository} onCreated={onCreated} />);

    // 1. Entry chooser
    fireEvent.click(screen.getByRole("button", { name: /χειροκίνητη/i }));

    // 2. Manual entry form
    fireEvent.change(screen.getByLabelText(/όνομα φαρμάκου/i), { target: { value: "Ιβουπροφένη" } });
    fireEvent.click(screen.getByRole("button", { name: /συνέχεια/i }));

    // 3. Details step — pick a form, set strength, continue
    fireEvent.click(screen.getByRole("radio", { name: /δισκίο/i }));
    fireEvent.change(screen.getByLabelText(/τιμή περιεκτικότητας/i), { target: { value: "400" } });
    fireEvent.change(screen.getByLabelText(/μονάδα περιεκτικότητας/i), { target: { value: "mg" } });
    fireEvent.click(screen.getByRole("button", { name: /συνέχεια/i }));

    // 4. Review & finish
    expect(screen.getByText("Ιβουπροφένη")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ολοκλήρωση/i }));

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));

    const input = create.mock.calls[0][0] as CreateUserMedicationInput;
    expect(input.profileId).toBe("profile-1");
    expect(input.catalogProductId).toBeNull();
    expect(input.customName).toBe("Ιβουπροφένη");
    expect(input.customForm).toBe("tablet");
    expect(input.customStrengthValue).toBe("400");
    expect(input.customStrengthUnit).toBe("mg");
    expect(input.id).toBeTruthy();
    expect(input.clientMutationId).toBeTruthy();

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it("shows a plain-language error and stays on the review step if creation fails", async () => {
    const repository: UserMedicationRepository = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockRejectedValue(new Error("boom")),
      applyRemote: vi.fn(),
      markConflict: vi.fn(),
      markFailed: vi.fn(),
    };
    render(<AddMedicationFlow profileId="profile-1" repository={repository} />);

    fireEvent.click(screen.getByRole("button", { name: /χειροκίνητη/i }));
    fireEvent.change(screen.getByLabelText(/όνομα φαρμάκου/i), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /συνέχεια/i }));
    fireEvent.click(screen.getByRole("button", { name: /συνέχεια/i }));
    fireEvent.click(screen.getByRole("button", { name: /ολοκλήρωση/i }));

    await vi.waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    // Never a raw error code shown to the user (CLAUDE.md rule 8 / Phase 3 §8).
    expect(screen.getByRole("alert").textContent).not.toMatch(/boom/i);
  });
});

describe("AddMedicationFlow — scan entry, wired end to end (Phase 8)", () => {
  function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
    return {
      id: "product-1",
      gtin: "05012345678900",
      eofCode: null,
      name: "Παρακεταμόλη 500mg",
      nameNormalized: "παρακεταμολη 500mg",
      manufacturer: null,
      activeIngredient: "Παρακεταμόλη",
      strengthValue: "500",
      strengthUnit: "mg",
      form: "tablet",
      packSizeValue: "20",
      packSizeUnit: "tablet",
      regulatorySource: SEED_PLACEHOLDER_SOURCE,
      sourceVersion: "test",
      sourceLastUpdated: new Date().toISOString(),
      lifecycleState: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it("the Scan option is disabled when the platform reports unavailable", () => {
    const platform: MobilePlatform = { isAvailable: () => false, scanBarcode: vi.fn() };
    render(<AddMedicationFlow profileId="profile-1" platform={platform} />);
    expect(screen.getByRole("button", { name: /σάρωση/i })).toBeDisabled();
  });

  it("scan -> candidate found -> confirm -> details -> review -> creates a UserMedication, with the scanned batch/expiry folded into notes", async () => {
    const { repository, create } = makeFakeRepository();
    const product = makeProduct();
    const raw = `01${product.gtin}17${"261231"}10${"LOT9"}`;
    const platform: MobilePlatform = {
      isAvailable: () => true,
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: raw, format: "GS1_DATA_MATRIX" }),
    };
    const cacheRepository: CatalogCacheRepository = {
      get: vi.fn().mockResolvedValue(null),
      getByGtin: vi.fn().mockResolvedValue(product),
      getByEofCode: vi.fn().mockResolvedValue(null),
      cacheAll: vi.fn().mockResolvedValue(undefined),
    };

    render(<AddMedicationFlow profileId="profile-1" repository={repository} platform={platform} cacheRepository={cacheRepository} />);

    fireEvent.click(screen.getByRole("button", { name: /σάρωση/i }));

    fireEvent.click(await screen.findByRole("button", { name: /επιβεβαίωση/i }));

    // Details step, pre-filled read-only from the catalog match — just continue.
    fireEvent.click(await screen.findByRole("button", { name: /συνέχεια/i }));
    // Review & finish.
    fireEvent.click(screen.getByRole("button", { name: /ολοκλήρωση/i }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const input = create.mock.calls[0][0] as CreateUserMedicationInput;
    expect(input.catalogProductId).toBe(product.id);
    expect(input.notes).toContain("LOT9");
    expect(input.notes).toContain("2026-12-31");
  });

  it("scan -> cancelled -> returns to the entry chooser (no error, no flow interruption)", async () => {
    const platform: MobilePlatform = {
      isAvailable: () => true,
      scanBarcode: vi.fn().mockResolvedValue({ status: "cancelled" }),
    };
    render(<AddMedicationFlow profileId="profile-1" platform={platform} />);

    fireEvent.click(screen.getByRole("button", { name: /σάρωση/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /σάρωση/i })).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("scan -> not found -> Continue manually -> ManualEntryForm is pre-filled from the parsed GTIN-less scan", async () => {
    const GS = "\x1d";
    const platform: MobilePlatform = {
      isAvailable: () => true,
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: `10${"BATCHONLY"}${GS}17${"260630"}`, format: "GS1_DATA_MATRIX" }),
    };
    const cacheRepository: CatalogCacheRepository = {
      get: vi.fn().mockResolvedValue(null),
      getByGtin: vi.fn().mockResolvedValue(null),
      getByEofCode: vi.fn().mockResolvedValue(null),
      cacheAll: vi.fn().mockResolvedValue(undefined),
    };

    render(<AddMedicationFlow profileId="profile-1" platform={platform} cacheRepository={cacheRepository} />);

    fireEvent.click(screen.getByRole("button", { name: /σάρωση/i }));

    fireEvent.click(await screen.findByRole("button", { name: /χειροκίνητη/i }));

    expect(screen.getByLabelText(/παρτίδα/i)).toHaveValue("BATCHONLY");
    expect(screen.getByLabelText(/ημερομηνία λήξης/i)).toHaveValue("2026-06-30");
  });
});
