// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PackageOcrCandidateFlow } from "@/components/medications/PackageOcrCandidateFlow";
import type { CatalogCacheRepository, LearnedMappingRepository, OfflineIndexRepository } from "@/lib/domain/repositories";
import type { OfflineIndexEntry } from "@/lib/domain/offline-index";
import type { ParsedBarcode } from "@/lib/domain/gs1";
import type { MobilePlatform, OcrCaptureResult } from "@/lib/platform/mobile-platform";

afterEach(() => cleanup());

function makeEntry(overrides: Partial<OfflineIndexEntry> = {}): OfflineIndexEntry {
  return {
    id: "flagyl-product",
    eofCode: null,
    gtin: null,
    gtins: [],
    barcode: null,
    name: "FLAGYL CAPS 500MG/CAP",
    activeIngredient: "METRONIDAZOLE",
    strengthValue: "500",
    strengthUnit: "mg",
    form: "capsule",
    packSizeValue: "30",
    packSizeUnit: "capsules",
    ...overrides,
  };
}

function makeParsed(overrides: Partial<ParsedBarcode> = {}): ParsedBarcode {
  return { raw: "05201048000563", format: "GS1_DATA_MATRIX", gtin: "05201048000563", expiry: null, batch: null, serial: null, ...overrides };
}

function fakePlatform(recognizePackageText: () => Promise<OcrCaptureResult>): MobilePlatform {
  return {
    isAvailable: () => true,
    scanBarcode: vi.fn(),
    recognizePackageText,
    requestReminderPermission: vi.fn(),
    upsertReminder: vi.fn(),
    cancelRemindersForDoseEvent: vi.fn(),
  };
}

function fakeOfflineIndex(overrides: Partial<OfflineIndexRepository> = {}): OfflineIndexRepository {
  return {
    getManifest: vi.fn().mockResolvedValue(null),
    getById: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),
    getByEofCode: vi.fn().mockResolvedValue(null),
    getByGtin: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue([]),
    replaceAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeLearnedMappings(overrides: Partial<LearnedMappingRepository> = {}): LearnedMappingRepository {
  return {
    getByGtin: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue({ overwroteDifferentProduct: false }),
    listUnsynced: vi.fn().mockResolvedValue([]),
    markSynced: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeCache(overrides: Partial<CatalogCacheRepository> = {}): CatalogCacheRepository {
  return {
    get: vi.fn().mockResolvedValue(null),
    getByGtin: vi.fn().mockResolvedValue(null),
    getByEofCode: vi.fn().mockResolvedValue(null),
    cacheAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("PackageOcrCandidateFlow (OCR-fallback task spec §1-§15)", () => {
  it("idle -> capture -> single high-confidence candidate -> confirm: saves the learned mapping, caches the product, and calls onConfirmCandidate", async () => {
    const entry = makeEntry();
    const platform = fakePlatform(() => Promise.resolve({ status: "ok", rawText: "FLAGYL\n500 MG\nCAPSULES\nBTX30" }));
    const offlineIndex = fakeOfflineIndex({ getAll: vi.fn().mockResolvedValue([entry]) });
    const learnedMappings = fakeLearnedMappings();
    const cacheRepository = fakeCache();
    const onConfirmCandidate = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "created" }) });

    render(
      <PackageOcrCandidateFlow
        gtin="05201048000563"
        parsed={makeParsed()}
        onConfirmCandidate={onConfirmCandidate}
        onFallbackToManual={vi.fn()}
        platform={platform}
        offlineIndex={offlineIndex}
        learnedMappings={learnedMappings}
        cacheRepository={cacheRepository}
        fetchImpl={fetchImpl}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /αναγνώρισης από την ετικέτα/i }));

    const confirmButton = await screen.findByRole("button", { name: /Επιβεβαίωση/i });
    expect(await screen.findByRole("heading", { name: entry.name })).toBeTruthy();
    fireEvent.click(confirmButton);

    await vi.waitFor(() => expect(onConfirmCandidate).toHaveBeenCalledTimes(1));
    expect(onConfirmCandidate).toHaveBeenCalledWith(expect.objectContaining({ id: entry.id, name: entry.name }), expect.any(Object));

    expect(learnedMappings.save).toHaveBeenCalledWith(
      expect.objectContaining({ gtin: "05201048000563", catalogProductId: entry.id, evidenceType: "USER_CONFIRMED", syncedAt: null }),
    );
    expect(cacheRepository.cacheAll).toHaveBeenCalledWith([expect.objectContaining({ id: entry.id, name: entry.name })]);
  });

  it("ambiguous OCR result: shows a picker, never auto-selects, and confirming the chosen one still goes through CandidateConfirmation", async () => {
    const augmentin1 = makeEntry({ id: "augmentin-1", name: "AUGMENTIN 875MG/125MG TABS", strengthValue: null, form: null, packSizeValue: null });
    const augmentin2 = makeEntry({ id: "augmentin-2", name: "AUGMENTIN 500MG/125MG TABS", strengthValue: null, form: null, packSizeValue: null });
    const platform = fakePlatform(() => Promise.resolve({ status: "ok", rawText: "AUGMENTIN" }));
    const offlineIndex = fakeOfflineIndex({ getAll: vi.fn().mockResolvedValue([augmentin1, augmentin2]) });
    const onConfirmCandidate = vi.fn();

    render(
      <PackageOcrCandidateFlow
        gtin="05054290011142"
        parsed={makeParsed({ gtin: "05054290011142" })}
        onConfirmCandidate={onConfirmCandidate}
        onFallbackToManual={vi.fn()}
        platform={platform}
        offlineIndex={offlineIndex}
        learnedMappings={fakeLearnedMappings()}
        cacheRepository={fakeCache()}
        fetchImpl={vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "created" }) })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /αναγνώρισης από την ετικέτα/i }));

    expect(await screen.findByText(/πολλές πιθανές συσκευασίες/i)).toBeTruthy();
    expect(onConfirmCandidate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /AUGMENTIN 875MG\/125MG TABS/i }));

    expect(await screen.findByRole("heading", { name: "AUGMENTIN 875MG/125MG TABS" })).toBeTruthy();
  });

  it("OCR_NOT_FOUND: offers retry and manual search, never a fabricated candidate", async () => {
    const platform = fakePlatform(() => Promise.resolve({ status: "ok", rawText: "COMPLETELY UNRELATED TEXT" }));
    const offlineIndex = fakeOfflineIndex({ getAll: vi.fn().mockResolvedValue([makeEntry()]) });
    const onFallbackToManual = vi.fn();

    render(
      <PackageOcrCandidateFlow
        gtin="00000000000000"
        parsed={makeParsed({ gtin: "00000000000000" })}
        onConfirmCandidate={vi.fn()}
        onFallbackToManual={onFallbackToManual}
        platform={platform}
        offlineIndex={offlineIndex}
        learnedMappings={fakeLearnedMappings()}
        cacheRepository={fakeCache()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /αναγνώρισης από την ετικέτα/i }));

    expect(await screen.findByText(/Δεν βρέθηκε αντιστοιχία/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Χειροκίνητη αναζήτηση/i }));
    expect(onFallbackToManual).toHaveBeenCalledTimes(1);
  });

  it("a cancelled native capture returns to idle silently, no error shown", async () => {
    const platform = fakePlatform(() => Promise.resolve({ status: "cancelled" }));

    render(
      <PackageOcrCandidateFlow
        gtin="00000000000000"
        parsed={makeParsed()}
        onConfirmCandidate={vi.fn()}
        onFallbackToManual={vi.fn()}
        platform={platform}
        offlineIndex={fakeOfflineIndex()}
        learnedMappings={fakeLearnedMappings()}
        cacheRepository={fakeCache()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /αναγνώρισης από την ετικέτα/i }));

    await screen.findByRole("button", { name: /αναγνώρισης από την ετικέτα/i });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
