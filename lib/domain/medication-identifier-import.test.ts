import { describe, expect, it } from "vitest";
import { validateIdentifierImportRecord, type MedicationIdentifierImportRecord } from "@/lib/domain/medication-identifier-import";

function makeRecord(overrides: Partial<MedicationIdentifierImportRecord> = {}): MedicationIdentifierImportRecord {
  return {
    eofCode: "076130401",
    identifierType: "GTIN",
    identifierValue: "05012345678900",
    source: "test-source",
    sourceRowNumber: 1,
    ...overrides,
  };
}

describe("validateIdentifierImportRecord (GTIN-resolution task spec §18)", () => {
  it("ok: a well-formed GTIN", () => {
    expect(validateIdentifierImportRecord(makeRecord())).toEqual({ status: "ok" });
  });

  it("ok: a GTIN with leading zeros preserved as a string", () => {
    expect(validateIdentifierImportRecord(makeRecord({ identifierValue: "00012345678905" }))).toEqual({ status: "ok" });
  });

  it("malformed_gtin: contains non-digit characters", () => {
    expect(validateIdentifierImportRecord(makeRecord({ identifierValue: "0501234567890X" }))).toEqual({ status: "malformed_gtin" });
  });

  it("malformed_gtin: longer than 14 digits — never silently truncated", () => {
    expect(validateIdentifierImportRecord(makeRecord({ identifierValue: "123456789012345" }))).toEqual({ status: "malformed_gtin" });
  });

  it("non-GTIN identifier types (NHRN/EAN13/EOF_CODE) are not subject to the GTIN-digit-count check", () => {
    expect(validateIdentifierImportRecord(makeRecord({ identifierType: "NHRN", identifierValue: "anything-not-numeric" }))).toEqual({ status: "ok" });
  });
});
