import { describe, expect, it } from "vitest";
import { parseBarcode } from "@/lib/domain/gs1";

const GS = "\x1d";

describe("parseBarcode — plain EAN (no GS1 AIs, the raw value IS the GTIN)", () => {
  it("EAN_13: normalizes to a 14-digit GTIN by left-padding with one zero", () => {
    const result = parseBarcode("5201234567890", "EAN_13");
    expect(result).toEqual({
      raw: "5201234567890",
      format: "EAN_13",
      gtin: "05201234567890",
      expiry: null,
      batch: null,
      serial: null,
    });
  });

  it("EAN_8: normalizes to a 14-digit GTIN by left-padding with six zeros", () => {
    const result = parseBarcode("40170725", "EAN_8");
    expect(result.gtin).toBe("00000040170725");
    expect(result.expiry).toBeNull();
    expect(result.batch).toBeNull();
    expect(result.serial).toBeNull();
  });

  it("EAN_13 with non-numeric content: gtin is null rather than a guess", () => {
    const result = parseBarcode("52012ABCDE890", "EAN_13");
    expect(result.gtin).toBeNull();
  });
});

describe("parseBarcode — GS1_DATA_MATRIX, multiple AIs in one string", () => {
  it("parses GTIN (01) + expiry (17) + batch (10) + serial (21), all present", () => {
    // 01 <14-digit GTIN> 17 <YYMMDD> 10 <batch> <GS> 21 <serial>
    // batch is NOT the last element, so it needs a GS terminator; serial IS
    // last, so it correctly has none.
    const raw = `01${"05012345678900"}17${"261231"}10${"LOT42A"}${GS}21${"SN0009"}`;
    const result = parseBarcode(raw, "GS1_DATA_MATRIX");
    expect(result).toEqual({
      raw,
      format: "GS1_DATA_MATRIX",
      gtin: "05012345678900",
      expiry: "2026-12-31",
      batch: "LOT42A",
      serial: "SN0009",
    });
  });

  it("parses GTIN + expiry only — batch/serial legitimately absent, never invented", () => {
    const raw = `01${"05012345678900"}17${"260101"}`;
    const result = parseBarcode(raw, "GS1_DATA_MATRIX");
    expect(result.gtin).toBe("05012345678900");
    expect(result.expiry).toBe("2026-01-01");
    expect(result.batch).toBeNull();
    expect(result.serial).toBeNull();
  });

  it("parses GTIN + batch only, batch as the LAST field with no trailing GS — must capture the full value, not truncate at a phantom separator", () => {
    const raw = `01${"05012345678900"}10${"BATCH-LONG-VALUE-9"}`;
    const result = parseBarcode(raw, "GS1_DATA_MATRIX");
    expect(result.gtin).toBe("05012345678900");
    expect(result.expiry).toBeNull();
    expect(result.batch).toBe("BATCH-LONG-VALUE-9");
    expect(result.serial).toBeNull();
  });

  it("FNC1 edge case: two consecutive variable-length fields (batch then serial) split exactly at the GS, the separator itself never appears in either value", () => {
    const raw = `10${"BATCH1"}${GS}21${"SERIAL1"}`;
    const result = parseBarcode(raw, "GS1_DATA_MATRIX");
    expect(result.batch).toBe("BATCH1");
    expect(result.serial).toBe("SERIAL1");
    expect(result.batch).not.toContain(GS);
    expect(result.serial).not.toContain(GS);
  });

  it("strips a leading GS1 DataMatrix symbology identifier (]d2) some decoders prepend", () => {
    const raw = `]d201${"05012345678900"}`;
    const result = parseBarcode(raw, "GS1_DATA_MATRIX");
    expect(result.gtin).toBe("05012345678900");
  });

  it("strips a literal leading FNC1/group-separator character if the decoder passes it through", () => {
    const raw = `${GS}01${"05012345678900"}`;
    const result = parseBarcode(raw, "GS1_DATA_MATRIX");
    expect(result.gtin).toBe("05012345678900");
  });

  it("truncated GTIN (fewer than 14 digits after AI 01): stops rather than guessing, gtin stays null", () => {
    const raw = "010012345"; // only 7 digits follow the AI, not 14
    const result = parseBarcode(raw, "GS1_DATA_MATRIX");
    expect(result.gtin).toBeNull();
    expect(result.expiry).toBeNull();
  });

  it("unrecognized AI mid-string: keeps whatever was already parsed, stops before misreading the remainder", () => {
    // 01<GTIN> then AI "99" (not in this module's known set) followed by junk.
    const raw = `01${"05012345678900"}99JUNKDATA`;
    const result = parseBarcode(raw, "GS1_DATA_MATRIX");
    expect(result.gtin).toBe("05012345678900");
    expect(result.batch).toBeNull();
    expect(result.serial).toBeNull();
  });

  it("expiry day '00' means the last day of the month (GS1 rule)", () => {
    const raw = `17${"260200"}`; // Feb 2026, day 00
    const result = parseBarcode(raw, "GS1_DATA_MATRIX");
    expect(result.expiry).toBe("2026-02-28"); // 2026 is not a leap year
  });

  it("century pivot: two-digit year 50 -> 2050, year 51 -> 1951", () => {
    expect(parseBarcode(`17${"500101"}`, "GS1_DATA_MATRIX").expiry).toBe("2050-01-01");
    expect(parseBarcode(`17${"510101"}`, "GS1_DATA_MATRIX").expiry).toBe("1951-01-01");
  });

  it("invalid calendar date (e.g. Feb 30) is rejected rather than silently rolled over", () => {
    const raw = `17${"260230"}`;
    const result = parseBarcode(raw, "GS1_DATA_MATRIX");
    expect(result.expiry).toBeNull();
  });

  it("empty string yields an all-null result without throwing", () => {
    const result = parseBarcode("", "GS1_DATA_MATRIX");
    expect(result).toEqual({ raw: "", format: "GS1_DATA_MATRIX", gtin: null, expiry: null, batch: null, serial: null });
  });
});

describe("parseBarcode — CODE_128 / QR_CODE / UNKNOWN: opaque, never guessed", () => {
  it("CODE_128 carries only the raw string, every parsed field is null", () => {
    const result = parseBarcode("1234567890", "CODE_128");
    expect(result).toEqual({ raw: "1234567890", format: "CODE_128", gtin: null, expiry: null, batch: null, serial: null });
  });

  it("UNKNOWN carries only the raw string, every parsed field is null", () => {
    const result = parseBarcode("whatever-this-is", "UNKNOWN");
    expect(result).toEqual({ raw: "whatever-this-is", format: "UNKNOWN", gtin: null, expiry: null, batch: null, serial: null });
  });

  it("QR_CODE is opaque too, even when its content looks like a URL or a numeric string — never mined for a GTIN", () => {
    const result = parseBarcode("https://example.com/leaflet/5012345678900", "QR_CODE");
    expect(result).toEqual({ raw: "https://example.com/leaflet/5012345678900", format: "QR_CODE", gtin: null, expiry: null, batch: null, serial: null });
  });
});
