import { describe, expect, it } from "vitest";
import { parseGreekNationalMedicineBarcode } from "@/lib/domain/greek-national-barcode";

describe("parseGreekNationalMedicineBarcode", () => {
  it("decodes a real, sourced Greek pharmaceutical barcode (DEPON effervescent 500mg, erx.gr SPC listing) into its EOF code", () => {
    const result = parseGreekNationalMedicineBarcode("2800232802025");
    expect(result).toEqual({ kind: "GREEK_NATIONAL_EAN13", barcode: "2800232802025", eofCode: "023280202" });
  });

  it("decodes a second real, sourced barcode with a different EOF code (official EOF bulletin sample, SFEE mirror)", () => {
    const result = parseGreekNationalMedicineBarcode("2801567501010");
    expect(result).toEqual({ kind: "GREEK_NATIONAL_EAN13", barcode: "2801567501010", eofCode: "156750101" });
  });

  it("preserves a leading zero in the extracted EOF code — never coerced to a number", () => {
    const result = parseGreekNationalMedicineBarcode("2800232801011");
    expect(result?.eofCode).toBe("023280101");
    expect(typeof result?.eofCode).toBe("string");
  });

  it("rejects a barcode with an invalid EAN-13 check digit — never resolves an invalid code", () => {
    // Same digits as the valid Depon example above, last digit flipped.
    const result = parseGreekNationalMedicineBarcode("2800232802026");
    expect(result).toBeNull();
  });

  it("rejects a barcode that doesn't start with the Greek pharmaceutical prefix 280", () => {
    const result = parseGreekNationalMedicineBarcode("5201234567890");
    expect(result).toBeNull();
  });

  it("rejects a barcode shorter than 13 digits", () => {
    const result = parseGreekNationalMedicineBarcode("280023280202");
    expect(result).toBeNull();
  });

  it("rejects a barcode longer than 13 digits", () => {
    const result = parseGreekNationalMedicineBarcode("28002328020255");
    expect(result).toBeNull();
  });

  it("rejects a non-numeric value rather than guessing", () => {
    const result = parseGreekNationalMedicineBarcode("280023280202X");
    expect(result).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(parseGreekNationalMedicineBarcode("")).toBeNull();
  });
});
