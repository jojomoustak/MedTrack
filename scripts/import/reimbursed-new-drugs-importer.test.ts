import { describe, expect, it } from "vitest";
import { parseReimbursedNewDrugsRows } from "@/scripts/import/reimbursed-new-drugs-importer";
import { validateImportRecord } from "@/lib/domain/medication-import";

// A small, hand-curated fixture (spec §35) — real header + real row
// verbatim from the actual Q1 2026 reimbursed-track "new drugs" bulletin
// downloaded from moh.gov.gr on 2026-08-24 (`data/raw/ministry/reimbursed/`,
// not committed — see data/README.md).
const REAL_HEADER = ["Κωδικός", "BARCODE", "Περιγραφή Προϊόντος", "ATC", "Μη Αποζημιούμενο", "Τιμή Παραγωγού", "Χονδρική Τιμή", "Λιανική Τιμή", "Δραστική/ες", "KAK", "ΦΠΑ"];

const MYNZEPLI_ROW = [
  "342010101",
  "2803420101016",
  "MYNZEPLI IN.SO.VIAL 40MG/ML BT X 1 ΦΙΑΛΙΔΙΟ Χ 0.1ML + 1 ΒΕΛΟΝΑ ΜΕ ΦΙΛΤΡΟ",
  "S01LA05",
  "",
  "240.81",
  "244.42",
  "290.18",
  "AFLIBERCEPT",
  "ADVANZ PHARMA LIMITED, IRELAND",
  "6%",
];

describe("parseReimbursedNewDrugsRows — real header/row shape from the live 2026 moh.gov.gr reimbursed-track bulletin", () => {
  it("maps a real MYNZEPLI (AFLIBERCEPT) row into a canonical MedicationImportRecord, using retail price (Λιανική Τιμή), not wholesale/manufacturer price", () => {
    const { records, skippedRowNumbers } = parseReimbursedNewDrugsRows([REAL_HEADER, MYNZEPLI_ROW], "snapshot-reimbursed-1");

    expect(skippedRowNumbers).toEqual([]);
    expect(records).toEqual([
      {
        eofCode: "342010101",
        barcode: "2803420101016",
        rawProductDescription: "MYNZEPLI IN.SO.VIAL 40MG/ML BT X 1 ΦΙΑΛΙΔΙΟ Χ 0.1ML + 1 ΒΕΛΟΝΑ ΜΕ ΦΙΛΤΡΟ",
        atcCode: "S01LA05",
        retailPrice: "290.18",
        activeIngredient: "AFLIBERCEPT",
        marketingAuthorisationHolder: "ADVANZ PHARMA LIMITED, IRELAND",
        sourceSnapshotId: "snapshot-reimbursed-1",
        sourceRowNumber: 1,
      },
    ]);

    expect(validateImportRecord(records[0])).toEqual({ status: "ok" });
  });

  it("throws rather than guessing when required columns aren't found", () => {
    const wrongHeader = ["Code", "Barcode", "Name"];
    expect(() => parseReimbursedNewDrugsRows([wrongHeader, MYNZEPLI_ROW], "snapshot-reimbursed-1")).toThrow(/required column\(s\) not found/i);
  });

  it("real December 2025 comprehensive-baseline header variant: mixed-case 'Barcode', 'Προϊόν' instead of 'Περιγραφή Προϊόντος', 'Δραστική ουσία', and the MAH column's full unabbreviated name", () => {
    const baselineHeader = ["Κωδικός", "Barcode", "Προϊόν", "ATC", "Μη Αποζημιούμενο", "Τιμή Παραγωγού", "Χονδρική Τιμή", "Λιανική Τιμή", "Δραστική ουσία", "Κάτοχος Άδειας Κυκλοφορίας", "ΦΠΑ"];
    const doralinRow = [
      "210040201",
      "2802100402016",
      "DORALIN F.C.TAB 40MG/TAB ΒΤx30 (BLIST 3x10)",
      "A03AB06",
      " ",
      "5.66 ",
      "5.94 ",
      "8.19 ",
      "OTILONIUM",
      "A.MENARINI INDUSTRIE FARMACEUTICHE RIUNITE SRL, ITALY",
      "6%",
    ];

    const { records } = parseReimbursedNewDrugsRows([baselineHeader, doralinRow], "snapshot-baseline");

    expect(records).toEqual([
      {
        eofCode: "210040201",
        barcode: "2802100402016",
        rawProductDescription: "DORALIN F.C.TAB 40MG/TAB ΒΤx30 (BLIST 3x10)",
        atcCode: "A03AB06",
        retailPrice: "8.19",
        activeIngredient: "OTILONIUM",
        marketingAuthorisationHolder: "A.MENARINI INDUSTRIE FARMACEUTICHE RIUNITE SRL, ITALY",
        sourceSnapshotId: "snapshot-baseline",
        sourceRowNumber: 1,
      },
    ]);
    expect(validateImportRecord(records[0])).toEqual({ status: "ok" });
  });

  it("skips a row with a blank product description rather than fabricating one", () => {
    const blankNameRow = ["342010101", "2803420101016", "", "S01LA05", "", "240.81", "244.42", "290.18", "AFLIBERCEPT", "ADVANZ PHARMA LIMITED, IRELAND", "6%"];
    const { records, skippedRowNumbers } = parseReimbursedNewDrugsRows([REAL_HEADER, blankNameRow], "snapshot-reimbursed-1");

    expect(records).toEqual([]);
    expect(skippedRowNumbers).toEqual([1]);
  });
});
