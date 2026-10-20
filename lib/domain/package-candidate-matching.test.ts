import { describe, expect, it } from "vitest";
import { rankPackageCandidates } from "@/lib/domain/package-candidate-matching";
import { extractPackageOcrResult, type MedicationPackageOcrResult } from "@/lib/domain/ocr";
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

// Owner-reported 2026-10-20: «read the name» found nothing. The text reader's
// first line, taken as the brand, is often the maker or Greek form text.
describe("rankPackageCandidates — the brand anywhere on the box", () => {
  const flagyl = makeEntry();
  const algofren = makeEntry({ id: "entry-2", eofCode: "111", name: "ALGOFREN F.C.TAB 400MG/TAB", activeIngredient: "IBUPROFEN", strengthValue: "400", form: "tablet", packSizeValue: "20" });
  const ibuprofenGeneric = makeEntry({ id: "entry-3", eofCode: "222", name: "IBUPROFEN/GENERICS F.C.TAB 400MG/TAB", activeIngredient: "IBUPROFEN", strengthValue: "400", form: "tablet", packSizeValue: "20" });

  it("finds it when the maker's name is the first line read", () => {
    const ocr = extractPackageOcrResult(["SANOFI", "Flagyl®", "500 mg", "καψάκια σκληρά", "BTX30"].join("\n"));
    expect(ocr.brand).toBe("SANOFI");
    const result = rankPackageCandidates(ocr, [flagyl, algofren]);
    expect(result.candidates.map((c) => c.entry.id)).toEqual(["entry-1"]);
    expect(result.candidates[0].matchedBrand).toBe(true);
  });

  it("finds it when Greek text about the form comes first", () => {
    const ocr = extractPackageOcrResult(["Επικαλυμμένα με λεπτό υμένιο δισκία", "Algofren", "400 mg", "20 δισκία"].join("\n"));
    const result = rankPackageCandidates(ocr, [flagyl, algofren]);
    expect(result.candidates.map((c) => c.entry.id)).toEqual(["entry-2"]);
  });

  it("the box's own brand outranks a generic named after the ingredient printed on it", () => {
    const ocr = extractPackageOcrResult(["ALGOFREN", "ibuprofen", "400 mg", "δισκία"].join("\n"));
    const result = rankPackageCandidates(ocr, [algofren, ibuprofenGeneric]);
    expect(result.candidates[0].entry.id).toBe("entry-2");
    expect(result.confidence).not.toBe("OCR_AMBIGUOUS");
  });

  it("a generic's own box still finds the generic", () => {
    const ocr = extractPackageOcrResult(["IBUPROFEN/GENERICS", "400 mg", "επικαλυμμένα δισκία"].join("\n"));
    const result = rankPackageCandidates(ocr, [algofren, ibuprofenGeneric]);
    expect(result.candidates.map((c) => c.entry.id)).toEqual(["entry-3"]);
  });

  it("form words and numbers alone point to nothing", () => {
    const ocr = extractPackageOcrResult(["TABLETS", "500 mg", "ΔΙΣΚΙΑ 30"].join("\n"));
    expect(rankPackageCandidates(ocr, [flagyl, algofren])).toEqual({ confidence: "OCR_NOT_FOUND", candidates: [] });
  });
});

// Owner-reported 2026-10-20: an Algofren 600 mg box couldn't be told from the
// other Algofrens. The catalog imported from EOF has no separate strength,
// form or box size: only the name says them.
describe("rankPackageCandidates — strength, form and box size from the catalog name", () => {
  const bare = { strengthValue: null, strengthUnit: null, form: null, packSizeValue: null, packSizeUnit: null, activeIngredient: "IBUPROFEN" };
  const names = [
    "ALGOFREN EFF.GRAN 400MG/SACHET BTX10 SACHETS",
    "ALGOFREN F.C.TAB 400MG/TAB BTx20 (BLIST 2x10)",
    "ALGOFREN SYR 100MG/5ML FLx150 ML",
    "ALGOFREN RAPID SOFT.CAPS 400MG/CAP  BT X 10 CAPS",
    "ALGOFREN SUPP 500MG/SUP BT X12(STRIP 2X6)",
    "ALGOFREN F.C.TAB 200MG/TAB BTx20 (BLIST 2x10)",
    "ALGOFREN F.C.TAB 600MG/TAB BTx20 (BLIST 2x10)",
  ];
  const algofrens = names.map((name, i) => makeEntry({ ...bare, id: `algofren-${i}`, eofCode: String(i), name }));
  const algofren600 = "algofren-6";

  it("a Greek box of Algofren 600 mg tablets finds that one product, clearly", () => {
    const ocr = extractPackageOcrResult(["Algofren", "600 mg", "Επικαλυμμένα με λεπτό υμένιο δισκία", "Ιβουπροφαίνη", "20 δισκία"].join("\n"));
    const result = rankPackageCandidates(ocr, algofrens);
    expect(result.confidence).toBe("OCR_HIGH_CONFIDENCE");
    expect(result.candidates.map((c) => c.entry.id)).toEqual([algofren600]);
    expect(result.candidates[0]).toMatchObject({ matchedBrand: true, matchedStrength: true, matchedForm: true, matchedPackageQuantity: true });
  });

  it("the strength alone is enough to put the right one first", () => {
    const ocr = extractPackageOcrResult(["ALGOFREN", "600mg"].join("\n"));
    expect(rankPackageCandidates(ocr, algofrens).candidates[0].entry.id).toBe(algofren600);
  });

  it("the syrup's box finds the syrup", () => {
    const ocr = extractPackageOcrResult(["Algofren", "100 mg/5 ml", "πόσιμο εναιώρημα", "σιρόπι"].join("\n"));
    expect(rankPackageCandidates(ocr, algofrens).candidates[0].entry.id).toBe("algofren-2");
  });
});
