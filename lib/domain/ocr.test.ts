import { describe, expect, it } from "vitest";
import { extractPackageOcrResult, normalizeOcrToken } from "@/lib/domain/ocr";

describe("normalizeOcrToken (OCR-fallback task spec §6)", () => {
  it("normalizes case", () => {
    expect(normalizeOcrToken("Flagyl")).toBe("FLAGYL");
    expect(normalizeOcrToken("flagyl")).toBe("FLAGYL");
    expect(normalizeOcrToken("FLAGYL")).toBe("FLAGYL");
  });

  it("strips Greek diacritics (tonos/dialytika)", () => {
    expect(normalizeOcrToken("Παυσίπονο")).toBe("ΠΑΥΣΙΠΟΝΟ");
  });

  it("strips Latin accents the same way", () => {
    expect(normalizeOcrToken("café")).toBe("CAFE");
  });

  it("collapses whitespace runs and trims", () => {
    expect(normalizeOcrToken("  500   MG  ")).toBe("500 MG");
  });

  it("never rewrites one word into another — normalization only, no fuzzy correction", () => {
    expect(normalizeOcrToken("FLAGYL")).not.toBe(normalizeOcrToken("FLANDYL"));
  });
});

describe("extractPackageOcrResult — strength parsing (spec §5/§31)", () => {
  it("parses a single MG strength", () => {
    const result = extractPackageOcrResult("FLAGYL 500MG CAPSULES");
    expect(result.strengths).toEqual([{ value: "500", unit: "MG" }]);
  });

  it("parses '500 MG' with a space the same as '500MG'", () => {
    expect(extractPackageOcrResult("500 MG").strengths).toEqual([{ value: "500", unit: "MG" }]);
    expect(extractPackageOcrResult("500mg").strengths).toEqual([{ value: "500", unit: "MG" }]);
  });

  it("parses multi-strength combination drugs (spec §21 AUGMENTIN example)", () => {
    const result = extractPackageOcrResult("AUGMENTIN 875 MG + 125 MG F.C.TABS");
    expect(result.strengths).toEqual([
      { value: "875", unit: "MG" },
      { value: "125", unit: "MG" },
    ]);
  });

  it("recognizes MCG, G, ML, %, IU, and MG/ML units", () => {
    expect(extractPackageOcrResult("50 MCG").strengths).toEqual([{ value: "50", unit: "MCG" }]);
    expect(extractPackageOcrResult("1 G").strengths).toEqual([{ value: "1", unit: "G" }]);
    expect(extractPackageOcrResult("10 ML").strengths).toEqual([{ value: "10", unit: "ML" }]);
    expect(extractPackageOcrResult("2.5 %").strengths).toEqual([{ value: "2.5", unit: "%" }]);
    expect(extractPackageOcrResult("1000 IU").strengths).toEqual([{ value: "1000", unit: "IU" }]);
    expect(extractPackageOcrResult("5 MG/ML").strengths).toEqual([{ value: "5", unit: "MG/ML" }]);
  });

  it("normalizes a comma decimal separator to a dot", () => {
    expect(extractPackageOcrResult("0,5 MG").strengths).toEqual([{ value: "0.5", unit: "MG" }]);
  });

  it("is undefined (never a fabricated empty array) when no strength pattern matches", () => {
    expect(extractPackageOcrResult("SOME UNRELATED TEXT").strengths).toBeUndefined();
  });
});

describe("extractPackageOcrResult — form parsing (spec §5/§31)", () => {
  it.each([
    ["CAPSULES", "CAPSULE"],
    ["CAP", "CAPSULE"],
    ["TABLET", "TABLET"],
    ["TAB", "TABLET"],
    ["F.C.TAB", "TABLET"],
    ["SYRUP", "SYRUP"],
    ["SUSPENSION", "SUSPENSION"],
    ["CREAM", "CREAM"],
    ["GEL", "GEL"],
    ["SPRAY", "SPRAY"],
    ["DROPS", "DROPS"],
    ["SACHET", "SACHET"],
    ["AMPOULE", "AMPOULE"],
    ["VIAL", "VIAL"],
  ])("recognizes %s as %s", (raw, expected) => {
    expect(extractPackageOcrResult(`FLAGYL 500MG ${raw}`).pharmaceuticalForm).toBe(expected);
  });

  it("prefers the more specific F.C.TAB pattern over the generic TAB one", () => {
    expect(extractPackageOcrResult("AUGMENTIN F.C.TAB").pharmaceuticalForm).toBe("TABLET");
  });

  it("is undefined when no form keyword is present", () => {
    expect(extractPackageOcrResult("FLAGYL 500MG").pharmaceuticalForm).toBeUndefined();
  });
});

describe("extractPackageOcrResult — package quantity parsing (spec §5/§31)", () => {
  it("parses BTX30", () => {
    const result = extractPackageOcrResult("FLAGYL 500MG CAPS BTX30");
    expect(result.packageQuantity).toBe(30);
    expect(result.packageText).toMatch(/BTX30/i);
  });

  it("parses 'BT X 30' with spaces", () => {
    expect(extractPackageOcrResult("BT X 30").packageQuantity).toBe(30);
  });

  it("parses '30 CAPS'", () => {
    expect(extractPackageOcrResult("30 CAPS").packageQuantity).toBe(30);
  });

  it("parses '20 TABLETS'", () => {
    expect(extractPackageOcrResult("20 TABLETS").packageQuantity).toBe(20);
  });

  it("parses '2 x 10' as a total of 20 (two blisters of ten)", () => {
    expect(extractPackageOcrResult("2 x 10").packageQuantity).toBe(20);
  });

  it("is undefined when no quantity pattern matches", () => {
    expect(extractPackageOcrResult("FLAGYL 500MG").packageQuantity).toBeUndefined();
  });
});

describe("extractPackageOcrResult — brand guess (best-effort, spec §4)", () => {
  it("picks the first line that isn't itself a strength/form/quantity token", () => {
    const result = extractPackageOcrResult("FLAGYL\n500 MG\nCAPSULES\nBTX30");
    expect(result.brand).toBe("FLAGYL");
  });

  it("skips a leading blank line", () => {
    expect(extractPackageOcrResult("\nFLAGYL\n500MG").brand).toBe("FLAGYL");
  });

  it("is undefined when every line is just numbers/units", () => {
    expect(extractPackageOcrResult("500MG\n30").brand).toBeUndefined();
  });
});

describe("extractPackageOcrResult — real-world FLAGYL/AUGMENTIN regression (spec §22/§23)", () => {
  it("FLAGYL: extracts brand, strength, form, and quantity from realistic label text", () => {
    const result = extractPackageOcrResult("FLAGYL\n500 MG\nCAPSULES\nBTX30");
    expect(result).toMatchObject({
      brand: "FLAGYL",
      strengths: [{ value: "500", unit: "MG" }],
      pharmaceuticalForm: "CAPSULE",
      packageQuantity: 30,
    });
  });

  it("AUGMENTIN: extracts both combination strengths and the tablet form, never collapsing to brand alone", () => {
    const result = extractPackageOcrResult("AUGMENTIN\n875 MG + 125 MG\nF.C.TABS\n12 TABLETS");
    expect(result.brand).toBe("AUGMENTIN");
    expect(result.strengths).toEqual([
      { value: "875", unit: "MG" },
      { value: "125", unit: "MG" },
    ]);
    expect(result.pharmaceuticalForm).toBe("TABLET");
    expect(result.packageQuantity).toBe(12);
  });
});

describe("extractPackageOcrResult — never fabricates fields (spec §4)", () => {
  it("ingredients and ocrConfidence are always undefined — no deterministic extractor exists for either", () => {
    const result = extractPackageOcrResult("FLAGYL 500MG CAPSULES BTX30");
    expect(result.ingredients).toBeUndefined();
    expect(result.ocrConfidence).toBeUndefined();
  });

  it("rawText is always the untouched original input", () => {
    const raw = "  FLAGYL 500MG  ";
    expect(extractPackageOcrResult(raw).rawText).toBe(raw);
  });
});
