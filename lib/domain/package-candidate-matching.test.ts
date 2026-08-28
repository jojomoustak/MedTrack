import { describe, expect, it } from "vitest";
import { rankPackageCandidates } from "@/lib/domain/package-candidate-matching";
import type { MedicationPackageOcrResult } from "@/lib/domain/ocr";
import type { OfflineIndexEntry } from "@/lib/domain/offline-index";

function makeEntry(overrides: Partial<OfflineIndexEntry> = {}): OfflineIndexEntry {
  return {
    id: "entry-1",
    eofCode: "076130401",
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

function makeOcr(overrides: Partial<MedicationPackageOcrResult> = {}): MedicationPackageOcrResult {
  return {
    rawText: "FLAGYL\n500 MG\nCAPSULES\nBTX30",
    brand: "FLAGYL",
    strengths: [{ value: "500", unit: "MG" }],
    pharmaceuticalForm: "CAPSULE",
    packageQuantity: 30,
    ...overrides,
  };
}

describe("rankPackageCandidates — scoring (OCR-fallback task spec §9/§31)", () => {
  it("a candidate matching brand + strength + form + quantity scores as OCR_HIGH_CONFIDENCE", () => {
    const result = rankPackageCandidates(makeOcr(), [makeEntry()]);
    expect(result.confidence).toBe("OCR_HIGH_CONFIDENCE");
    expect(result.candidates).toHaveLength(1);
    const [candidate] = result.candidates;
    expect(candidate.matchedBrand).toBe(true);
    expect(candidate.matchedStrength).toBe(true);
    expect(candidate.matchedForm).toBe(true);
    expect(candidate.matchedPackageQuantity).toBe(true);
  });

  it("a result matching exactly one catalog presentation is high confidence (spec §10's own example)", () => {
    const result = rankPackageCandidates(makeOcr(), [
      makeEntry(),
      makeEntry({ id: "unrelated", name: "DEPON MAXIMUM", activeIngredient: "PARACETAMOL", strengthValue: "500", form: "tablet" }),
    ]);
    expect(result.confidence).toBe("OCR_HIGH_CONFIDENCE");
    expect(result.candidates[0].entry.id).toBe("entry-1");
  });

  it("brand-only evidence (no strength/form match) is at most OCR_PARTIAL, never HIGH_CONFIDENCE", () => {
    const result = rankPackageCandidates(makeOcr({ strengths: undefined, pharmaceuticalForm: undefined, packageQuantity: undefined }), [makeEntry()]);
    expect(result.confidence).toBe("OCR_PARTIAL");
  });

  it("multiple package presentations of the same ambiguous brand produce OCR_AMBIGUOUS, never an auto-pick (spec §10's AUGMENTIN example)", () => {
    const ocr = makeOcr({ rawText: "AUGMENTIN", brand: "AUGMENTIN", strengths: undefined, pharmaceuticalForm: undefined, packageQuantity: undefined });
    const entries = [
      makeEntry({ id: "augmentin-1", name: "AUGMENTIN 875MG/125MG TABS", activeIngredient: "AMOXICILLIN + CLAVULANIC ACID" }),
      makeEntry({ id: "augmentin-2", name: "AUGMENTIN 500MG/125MG TABS", activeIngredient: "AMOXICILLIN + CLAVULANIC ACID" }),
      makeEntry({ id: "augmentin-3", name: "AUGMENTIN DUO 400MG/57MG SUSP", activeIngredient: "AMOXICILLIN + CLAVULANIC ACID" }),
    ];
    const result = rankPackageCandidates(ocr, entries);
    expect(result.confidence).toBe("OCR_AMBIGUOUS");
    expect(result.candidates.length).toBeGreaterThan(1);
  });

  it("a strength+form match that disambiguates one AUGMENTIN presentation from several is not ambiguous (spec §23: never resolve only to the brand)", () => {
    const ocr = makeOcr({
      rawText: "AUGMENTIN\n875 MG + 125 MG\nF.C.TABS\n12 TABLETS",
      brand: "AUGMENTIN",
      strengths: [{ value: "875", unit: "MG" }, { value: "125", unit: "MG" }],
      pharmaceuticalForm: "TABLET",
      packageQuantity: 12,
    });
    const entries = [
      makeEntry({ id: "augmentin-1", name: "AUGMENTIN 875MG/125MG TABS", strengthValue: "875", strengthUnit: "mg", form: "tablet", packSizeValue: "12" }),
      makeEntry({ id: "augmentin-2", name: "AUGMENTIN 500MG/125MG TABS", strengthValue: "500", strengthUnit: "mg", form: "tablet", packSizeValue: "12" }),
    ];
    const result = rankPackageCandidates(ocr, entries);
    expect(result.confidence).toBe("OCR_HIGH_CONFIDENCE");
    expect(result.candidates[0].entry.id).toBe("augmentin-1");
  });

  it("no meaningfully-scoring candidate at all is OCR_NOT_FOUND, never a fabricated low-confidence guess", () => {
    const ocr = makeOcr({ rawText: "COMPLETELY UNRELATED PACKAGE TEXT", brand: "NONEXISTENTBRANDXYZ", strengths: undefined, pharmaceuticalForm: undefined, packageQuantity: undefined });
    const result = rankPackageCandidates(ocr, [makeEntry()]);
    expect(result.confidence).toBe("OCR_NOT_FOUND");
    expect(result.candidates).toEqual([]);
  });

  it("low-confidence candidates below the meaningful-score threshold are rejected outright, never shown", () => {
    const ocr = makeOcr({ brand: "SOMETHING", strengths: undefined, pharmaceuticalForm: undefined, packageQuantity: undefined, rawText: "SOMETHING" });
    const entries = [makeEntry({ name: "UNRELATED PRODUCT NAME" })];
    const result = rankPackageCandidates(ocr, entries);
    expect(result.confidence).toBe("OCR_NOT_FOUND");
  });

  it("an empty entries list never throws and returns OCR_NOT_FOUND", () => {
    expect(rankPackageCandidates(makeOcr(), [])).toEqual({ confidence: "OCR_NOT_FOUND", candidates: [] });
  });
});
