import { describe, expect, it } from "vitest";
import { validateImportRecord, type MedicationImportRecord } from "@/lib/domain/medication-import";

function makeRecord(overrides: Partial<MedicationImportRecord> = {}): MedicationImportRecord {
  return {
    eofCode: "023280202",
    barcode: "2800232802025",
    rawProductDescription: "DEPON EF.TAB 500MG/TAB BTx10",
    sourceSnapshotId: "snapshot-1",
    sourceRowNumber: 1,
    ...overrides,
  };
}

describe("validateImportRecord — spec §16: cross-check declared EOF code against the barcode's own decode", () => {
  it("ok: no barcode column present at all — nothing to cross-check", () => {
    const record = makeRecord({ barcode: undefined });
    expect(validateImportRecord(record)).toEqual({ status: "ok" });
  });

  it("ok: declared EOF code matches what the barcode decodes to (the real EOF bulletin sample from the architecture doc §2.3)", () => {
    const record = makeRecord({ eofCode: "156750101", barcode: "2801567501010" });
    expect(validateImportRecord(record)).toEqual({ status: "ok" });
  });

  it("eof_code_barcode_mismatch: declared EOF code disagrees with the barcode's own decode — never silently fixed", () => {
    // A real-world case of exactly this: the architecture doc §2.3 found a
    // farmako.net-displayed 'EOF code' (0232806, 7 digits) that does NOT
    // match the 9-digit code its own listed barcode decodes to.
    const record = makeRecord({ eofCode: "0232806", barcode: "2800232806030" });
    expect(validateImportRecord(record)).toEqual({
      status: "eof_code_barcode_mismatch",
      declaredEofCode: "0232806",
      decodedEofCode: "023280603",
    });
  });

  it("barcode_invalid: the barcode column itself isn't a well-formed Greek national EAN-13", () => {
    const record = makeRecord({ barcode: "1234567890123" });
    expect(validateImportRecord(record)).toEqual({ status: "barcode_invalid", barcode: "1234567890123" });
  });
});
