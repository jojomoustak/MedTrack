import { describe, expect, it } from "vitest";
import { parseMysyfaBulletinRows } from "@/scripts/import/mysyfa-importer";
import { validateImportRecord } from "@/lib/domain/medication-import";

// A small, hand-curated fixture (spec §35: never a full official dataset)
// — the real header row plus real rows verbatim from the actual Q3+Q4 2025
// ΜΗ.ΣΥ.ΦΑ. bulletin downloaded from moh.gov.gr on 2026-08-24
// (`data/raw/ministry/mysyfa/`, not committed — see data/README.md), plus
// one deliberately malformed row to exercise skip behavior.
const REAL_HEADER = ["ΚΩΔΙΚΟΣ", "BARCODE", "ΟΝΟΜΑΣΙΑ ΠΡΟΪΟΝΤΟΣ ", "ATC", "Ενδεικτική Λιανική Τιμή", "Δραστική ουσία", "ΚΑΚ", "ΦΠΑ"];

const DEPON_MAXIMUM_ROW = [
  "023280803",
  "2800232808034",
  "DEPON MAXIMUM EF.TAB 1G/TAB  BTx 20 (σε STRIPS)",
  "N02BE01",
  "4.3",
  "PARACETAMOL",
  "UPSA SAS, FRANCE",
  "6%",
];

const TALCID_ROW_WITH_STRAY_WHITESPACE = [
  "338280101\r\n",
  "2803382801016",
  "LIBERIZIN TAB 1,5MG/TAB  BT X 100 TABS ΣΕ ΚΥΨΕΛΕΣ PVC/PCTFE/ALUMINIUM",
  "N07BA04",
  "65.46",
  "CYTISINICLINE",
  " AFLOFARM FARMACJA POLSKA SP. Z O.O., POLAND",
  "6%",
];

describe("parseMysyfaBulletinRows — real header/row shapes from the live 2026 moh.gov.gr ΜΗ.ΣΥ.ΦΑ. bulletin", () => {
  it("maps a real DEPON MAXIMUM row into a canonical MedicationImportRecord, and it round-trips through barcode validation cleanly", () => {
    const { records, skippedRowNumbers } = parseMysyfaBulletinRows([REAL_HEADER, DEPON_MAXIMUM_ROW], "snapshot-1");

    expect(skippedRowNumbers).toEqual([]);
    expect(records).toEqual([
      {
        eofCode: "023280803",
        barcode: "2800232808034",
        rawProductDescription: "DEPON MAXIMUM EF.TAB 1G/TAB  BTx 20 (σε STRIPS)",
        atcCode: "N02BE01",
        retailPrice: "4.3",
        activeIngredient: "PARACETAMOL",
        marketingAuthorisationHolder: "UPSA SAS, FRANCE",
        sourceSnapshotId: "snapshot-1",
        sourceRowNumber: 1,
      },
    ]);

    // The whole point of Path A (architecture doc §2.5): this real official
    // row's own barcode decodes to exactly the EOF code the row itself declares.
    expect(validateImportRecord(records[0])).toEqual({ status: "ok" });
  });

  it("strips real stray \\r\\n and leading/trailing whitespace from cells (observed directly in the downloaded file, not hypothetical)", () => {
    const { records } = parseMysyfaBulletinRows([REAL_HEADER, TALCID_ROW_WITH_STRAY_WHITESPACE], "snapshot-1");

    expect(records[0].eofCode).toBe("338280101");
    expect(records[0].marketingAuthorisationHolder).toBe("AFLOFARM FARMACJA POLSKA SP. Z O.O., POLAND");
    expect(validateImportRecord(records[0])).toEqual({ status: "ok" });
  });

  it("skips a row with a blank EOF code rather than fabricating one", () => {
    const blankCodeRow = ["", "2800232808034", "SOME PRODUCT", "N02BE01", "4.3", "PARACETAMOL", "UPSA SAS, FRANCE", "6%"];
    const { records, skippedRowNumbers } = parseMysyfaBulletinRows([REAL_HEADER, blankCodeRow], "snapshot-1");

    expect(records).toEqual([]);
    expect(skippedRowNumbers).toEqual([1]);
  });

  it("throws rather than guessing a column mapping when the expected header row isn't found", () => {
    const wrongHeader = ["Code", "Barcode", "Name"];
    expect(() => parseMysyfaBulletinRows([wrongHeader, DEPON_MAXIMUM_ROW], "snapshot-1")).toThrow(/required column\(s\) not found/i);
  });

  it("empty input: no records, no error", () => {
    expect(parseMysyfaBulletinRows([], "snapshot-1")).toEqual({ records: [], skippedRowNumbers: [] });
  });

  it("maps multiple real rows in one pass, preserving source row numbers", () => {
    const { records } = parseMysyfaBulletinRows([REAL_HEADER, TALCID_ROW_WITH_STRAY_WHITESPACE, DEPON_MAXIMUM_ROW], "snapshot-1");
    expect(records.map((r) => r.sourceRowNumber)).toEqual([1, 2]);
    expect(records.map((r) => r.eofCode)).toEqual(["338280101", "023280803"]);
  });

  // The Ministry does NOT use one fixed header across releases — column
  // TEXT and ORDER both vary (confirmed by downloading and inspecting
  // seven real files spanning 2024-2026, 2026-08-24). These two fixtures
  // are verbatim header+row pairs from two of those real files, exercising
  // the synonym-based matcher against real variation, not a hypothetical one.

  it("real 2024 Q2-3-4 bulletin header variant: 'ΠΡΟΪΟΝ' instead of 'ΟΝΟΜΑΣΙΑ ΠΡΟΪΟΝΤΟΣ', 'Δραστική Ουσία' capitalized, a leading space on the price column", () => {
    const header2024 = ["Κωδικός", "BARCODE", "ΠΡΟΪΟΝ", "ATC", " Ενδεικτική Λιανική Τιμή", "Δραστική Ουσία", "ΚΑΚ"];
    const iberogastRow = [
      "328740101",
      "2803287401014",
      "IBEROGAST N® OR.DR.LIQ 15+30+20+15+10+10)ML/100ML  BOTTLE X 20ML (AMBER GLASS BOTTLE WITH A HDPE SCREW CAP)",
      "A03",
      "6.52",
      "ANTISPAS. AND ANTICHOLINERGIC AGENTS AND PROPULSIV",
      "BAYER ΕΛΛΑΣ ΑΒΕΕ",
    ];

    const { records } = parseMysyfaBulletinRows([header2024, iberogastRow], "snapshot-2024-q234");

    expect(records).toEqual([
      {
        eofCode: "328740101",
        barcode: "2803287401014",
        rawProductDescription: "IBEROGAST N® OR.DR.LIQ 15+30+20+15+10+10)ML/100ML  BOTTLE X 20ML (AMBER GLASS BOTTLE WITH A HDPE SCREW CAP)",
        atcCode: "A03",
        retailPrice: "6.52",
        activeIngredient: "ANTISPAS. AND ANTICHOLINERGIC AGENTS AND PROPULSIV",
        marketingAuthorisationHolder: "BAYER ΕΛΛΑΣ ΑΒΕΕ",
        sourceSnapshotId: "snapshot-2024-q234",
        sourceRowNumber: 1,
      },
    ]);
    expect(validateImportRecord(records[0])).toEqual({ status: "ok" });
  });

  it("real 2025 annual revision bulletin header variant: 'Περιγραφή Προϊόντος', 'Δραστική/ες', Latin 'KAK', extra unmapped columns (ΜΗΣΥΦΑ, Τιμή Παραγωγού) ignored", () => {
    const headerRevision2025 = ["Κωδικός", "BARCODE", "Περιγραφή Προϊόντος", "ATC", "ΜΗΣΥΦΑ", "Τιμή Παραγωγού", "Ενδεικτική Λιανική Τιμή", "Δραστική/ες", "KAK", "ΦΠΑ"];
    const refreshPlusRow = [
      "278470102",
      "2802784701023",
      "REFRESH PLUS EY.DR.S.SD 5MG/ML ΒΤx30 (περιέκτης μιας δόσης)  x 0,4 ML",
      "S01XA20",
      "N",
      "4.28",
      "5.89",
      "CARMELLOSE SODIUM",
      "ABBVIE ΦΑΡΜΑΚΕΥΤΙΚΗ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ Δ.Τ. ABBVIE A.E.",
      "6%",
    ];

    const { records } = parseMysyfaBulletinRows([headerRevision2025, refreshPlusRow], "snapshot-2025-revision");

    expect(records).toEqual([
      {
        eofCode: "278470102",
        barcode: "2802784701023",
        rawProductDescription: "REFRESH PLUS EY.DR.S.SD 5MG/ML ΒΤx30 (περιέκτης μιας δόσης)  x 0,4 ML",
        atcCode: "S01XA20",
        retailPrice: "5.89", // the RETAIL price column specifically, not "Τιμή Παραγωγού" (manufacturer price) which sits right before it
        activeIngredient: "CARMELLOSE SODIUM",
        marketingAuthorisationHolder: "ABBVIE ΦΑΡΜΑΚΕΥΤΙΚΗ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ Δ.Τ. ABBVIE A.E.",
        sourceSnapshotId: "snapshot-2025-revision",
        sourceRowNumber: 1,
      },
    ]);
    expect(validateImportRecord(records[0])).toEqual({ status: "ok" });
  });
});
