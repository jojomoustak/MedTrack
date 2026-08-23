import { describe, expect, it } from "vitest";
import { classifyBarcode } from "@/lib/domain/medication-identifier";

describe("classifyBarcode", () => {
  it("EAN_13, valid Greek national code: classified as Path A with its EOF code", () => {
    const result = classifyBarcode("2800232802025", "EAN_13");
    expect(result).toEqual({ kind: "GREEK_NATIONAL_EAN13", barcode: "2800232802025", eofCode: "023280202" });
  });

  it("EAN_13, valid but NOT Greek-prefixed: falls through to Path B as a GS1 GTIN", () => {
    const result = classifyBarcode("5201234567890", "EAN_13");
    expect(result).toEqual({ kind: "GS1_GTIN", gtin: "05201234567890" });
  });

  it("EAN_13, 280-prefixed but invalid check digit: falls through to Path B rather than resolving an invalid Greek code", () => {
    const result = classifyBarcode("2800232802026", "EAN_13");
    expect(result).toEqual({ kind: "GS1_GTIN", gtin: "02800232802026" });
  });

  it("GS1_DATA_MATRIX with a GTIN: classified as Path B even if the embedded GTIN happens to start with 280 — Path A only ever applies to EAN_13", () => {
    const raw = `01${"02800232802025"}17${"271231"}`;
    const result = classifyBarcode(raw, "GS1_DATA_MATRIX");
    expect(result).toEqual({ kind: "GS1_GTIN", gtin: "02800232802025" });
  });

  it("EAN_8: too short to ever be a Greek national code, classified as Path B", () => {
    const result = classifyBarcode("40170725", "EAN_8");
    expect(result).toEqual({ kind: "GS1_GTIN", gtin: "00000040170725" });
  });

  it("CODE_128 (opaque, no GTIN): returns null, never guessed", () => {
    const result = classifyBarcode("some-opaque-value", "CODE_128");
    expect(result).toBeNull();
  });

  it("EAN_13 with non-numeric content: returns null", () => {
    const result = classifyBarcode("52012ABCDE890", "EAN_13");
    expect(result).toBeNull();
  });
});
