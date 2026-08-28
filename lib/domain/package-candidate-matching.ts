/**
 * Package-level candidate matching (OCR-fallback task spec §7/§8/§9/§10):
 * ranks the EXISTING synced offline catalog (`OfflineIndexEntry[]` —
 * `lib/domain/offline-index.ts`, no second medication database, spec §7)
 * against a `MedicationPackageOcrResult` and produces an explainable,
 * deterministic confidence classification. Pure, I/O-free — same
 * discipline as every other domain module here.
 *
 * Deliberately NOT an opaque AI ranking (spec §9): every point in a
 * candidate's score traces back to one specific, named comparison
 * (`matchedBrand`, `matchedStrength`, `matchedForm`, `matchedPackageQuantity`),
 * so a wrong ranking is debuggable and the weights are unit-testable in
 * isolation.
 *
 * A known, explicitly-documented limitation: `OfflineIndexEntry` (and the
 * `medication_catalog_product` row it's built from) carries a single
 * `strengthValue`/`strengthUnit` pair per product — the catalog schema has
 * no combination-drug ("875mg + 125mg") multi-strength shape. This task
 * does not redesign that schema (out of scope — "do not restart the
 * catalog work"). `matchedStrength` below therefore checks "does ANY
 * OCR-extracted strength match the catalog's one strengthValue", not "do
 * BOTH components of a combination match" — an honest reflection of what
 * the existing data model can actually represent, not a silent
 * over-claim.
 */
import type { OfflineIndexEntry } from "@/lib/domain/offline-index";
import type { MedicationPackageOcrResult } from "@/lib/domain/ocr";
import { normalizeOcrToken } from "@/lib/domain/ocr";

export type OcrConfidenceState = "OCR_HIGH_CONFIDENCE" | "OCR_PARTIAL" | "OCR_AMBIGUOUS" | "OCR_NOT_FOUND";

export interface PackageCandidateScore {
  entry: OfflineIndexEntry;
  score: number;
  matchedBrand: boolean;
  matchedStrength: boolean;
  matchedForm: boolean;
  matchedPackageQuantity: boolean;
}

export interface PackageCandidateMatchResult {
  confidence: OcrConfidenceState;
  /** Ranked descending by score. Exactly one entry for `OCR_HIGH_CONFIDENCE`/`OCR_PARTIAL`, several (still requiring the user to pick) for `OCR_AMBIGUOUS`, empty for `OCR_NOT_FOUND`. */
  candidates: readonly PackageCandidateScore[];
}

// Named, tunable weights (spec §9: "strong evidence" vs "weak evidence") —
// every one of these is asserted against directly in
// `package-candidate-matching.test.ts`, so a weight change is a deliberate,
// visible decision, not an accidental side effect of some other edit.
const WEIGHT_BRAND_EXACT = 40;
const WEIGHT_BRAND_PARTIAL = 10;
const WEIGHT_STRENGTH = 30;
const WEIGHT_FORM = 15;
const WEIGHT_PACKAGE_QUANTITY = 15;

/** This project's `medication_catalog_product.form` CHECK constraint's fixed vocabulary (`lib/db/schema.ts`) — OCR's own form tokens (`TABLET`, `CAPSULE`, ...) are mapped onto it here so the two sides of the comparison speak the same vocabulary. */
const OCR_FORM_TO_CATALOG_FORM: Readonly<Record<string, string>> = {
  TABLET: "tablet",
  CAPSULE: "capsule",
  SYRUP: "ml",
  SUSPENSION: "ml",
  CREAM: "other",
  GEL: "other",
  SPRAY: "spray",
  DROPS: "drop",
  SACHET: "sachet",
  AMPOULE: "injection",
  VIAL: "injection",
};

const STRENGTH_TOLERANCE = 0.001;

function strengthsMatch(ocrValue: string, catalogValue: string): boolean {
  const a = Number(ocrValue);
  const b = Number(catalogValue);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) < STRENGTH_TOLERANCE;
}

function unitsEquivalent(ocrUnit: string | undefined, catalogUnit: string | null): boolean {
  if (!ocrUnit || !catalogUnit) return false;
  return normalizeOcrToken(ocrUnit) === normalizeOcrToken(catalogUnit);
}

function scoreEntry(ocr: MedicationPackageOcrResult, entry: OfflineIndexEntry): PackageCandidateScore {
  let score = 0;
  const normalizedName = normalizeOcrToken(entry.name);
  const normalizedBrand = ocr.brand ? normalizeOcrToken(ocr.brand) : null;

  let matchedBrand = false;
  if (normalizedBrand) {
    if (normalizedName.includes(normalizedBrand) || normalizedBrand.includes(normalizedName)) {
      score += WEIGHT_BRAND_EXACT;
      matchedBrand = true;
    } else {
      // Weak evidence (spec §9): partial token overlap — e.g. one shared
      // significant word between the OCR brand guess and the catalog name.
      const ocrTokens = new Set(normalizedBrand.split(" ").filter((t) => t.length >= 3));
      const nameTokens = new Set(normalizedName.split(" ").filter((t) => t.length >= 3));
      const overlap = [...ocrTokens].some((t) => nameTokens.has(t));
      if (overlap) score += WEIGHT_BRAND_PARTIAL;
    }
  }

  const matchedStrength = Boolean(
    entry.strengthValue &&
      ocr.strengths?.some((s) => strengthsMatch(s.value, entry.strengthValue as string) && unitsEquivalent(s.unit, entry.strengthUnit)),
  );
  if (matchedStrength) score += WEIGHT_STRENGTH;

  const matchedForm = Boolean(
    ocr.pharmaceuticalForm && entry.form && OCR_FORM_TO_CATALOG_FORM[ocr.pharmaceuticalForm] === entry.form.toLowerCase(),
  );
  if (matchedForm) score += WEIGHT_FORM;

  const matchedPackageQuantity = Boolean(
    ocr.packageQuantity !== undefined && entry.packSizeValue && Number(entry.packSizeValue) === ocr.packageQuantity,
  );
  if (matchedPackageQuantity) score += WEIGHT_PACKAGE_QUANTITY;

  return { entry, score, matchedBrand, matchedStrength, matchedForm, matchedPackageQuantity };
}

/** Below this, a candidate isn't meaningfully supported by anything OCR actually read — never shown to the user, never counted toward ambiguity. */
const MIN_MEANINGFUL_SCORE = 40;
/** Two candidates within this many points of each other are "tied" for ranking purposes — the difference isn't reliable enough to pick one over the other automatically. */
const TIE_MARGIN = 10;
/** A score at or above this, held uniquely, is strong enough (spec §10's "matching exactly one catalog presentation" example: brand + strength + form all agreeing) to present as the single high-confidence candidate — still gated on mandatory user confirmation regardless, never auto-applied. */
const HIGH_CONFIDENCE_SCORE = 85;

/**
 * Narrows `entries` to ones sharing at least one significant normalized
 * token with the OCR brand guess or raw text, before full scoring — keeps
 * this a cheap client-side pass over a ~9,000-entry offline index rather
 * than a full-catalog score-everything scan, and avoids surfacing
 * completely unrelated products as low-score "candidates."
 */
function prefilter(ocr: MedicationPackageOcrResult, entries: readonly OfflineIndexEntry[]): OfflineIndexEntry[] {
  const haystack = normalizeOcrToken(ocr.brand ?? ocr.rawText);
  if (haystack.length === 0) return [];
  const tokens = haystack.split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) return [];
  return entries.filter((entry) => {
    const name = normalizeOcrToken(entry.name);
    return tokens.some((t) => name.includes(t));
  });
}

/**
 * Ranks `entries` against `ocr` and classifies the result into one of the
 * four confidence states (spec §10). Never returns a "best guess" outside
 * these states, and `OCR_HIGH_CONFIDENCE` is still just a ranking signal —
 * the caller must still require explicit user confirmation before treating
 * it as a match (spec §10: "High confidence still requires user
 * confirmation").
 */
export function rankPackageCandidates(ocr: MedicationPackageOcrResult, entries: readonly OfflineIndexEntry[]): PackageCandidateMatchResult {
  const scored = prefilter(ocr, entries)
    .map((entry) => scoreEntry(ocr, entry))
    .filter((s) => s.score >= MIN_MEANINGFUL_SCORE)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { confidence: "OCR_NOT_FOUND", candidates: [] };

  const top = scored[0];
  const second = scored[1];
  const tiedWithTop = scored.filter((s) => top.score - s.score <= TIE_MARGIN);

  if (tiedWithTop.length > 1) {
    return { confidence: "OCR_AMBIGUOUS", candidates: tiedWithTop.slice(0, 5) };
  }

  if (top.score >= HIGH_CONFIDENCE_SCORE && (!second || top.score - second.score > TIE_MARGIN)) {
    return { confidence: "OCR_HIGH_CONFIDENCE", candidates: [top] };
  }

  return { confidence: "OCR_PARTIAL", candidates: [top] };
}
