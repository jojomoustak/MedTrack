/**
 * Deterministic parsing of on-device OCR text read off a real medicine
 * package (OCR-fallback task spec §4/§5/§6). Pure, I/O-free — no camera, no
 * ML Kit, no network — exactly like `lib/domain/gs1.ts`'s barcode parsing:
 * the native layer's job ends at "here is the raw recognized text," and
 * every structural decision about what that text means lives here so it's
 * unit-testable on the JVM-free Node side and never duplicated in Kotlin.
 *
 * Explicitly NOT an LLM-based parser (spec §5: "Do not use an LLM as the
 * core parser") — every field below comes from a fixed regex/keyword table,
 * so a given input always produces the same output and a wrong extraction
 * is a fixable pattern, not an unpredictable model call. Never fabricates a
 * field it didn't actually find a pattern for — every optional field stays
 * `undefined` (not a guessed/empty-string placeholder) when nothing
 * matched, per spec §4's "do not fabricate fields that OCR did not
 * reliably detect."
 */

export interface OcrStrength {
  /** Decimal string as read (e.g. "500", "0.5", "875") — never coerced to `number` here, same "don't lose precision/formatting" discipline as GTIN storage elsewhere in this codebase. */
  value: string;
  /** Normalized unit token (`MG`, `MCG`, `G`, `ML`, `%`, `IU`, `MG/ML`), or `undefined` if a bare number was found with no attached unit. */
  unit?: string;
}

export interface MedicationPackageOcrResult {
  rawText: string;
  /**
   * Best-effort guess at the brand/product name — the first line of
   * `rawText` that isn't itself just a dosage form, strength, or package-
   * quantity token. Genuinely heuristic (no dictionary of real medicine
   * names is consulted here — that's what `lib/domain/package-candidate-
   * matching.ts` searches the actual catalog for), so this is never treated
   * as authoritative on its own; it exists for display and as one scoring
   * signal, not as the sole match key.
   */
  brand?: string;
  /**
   * Not populated by this implementation. There is no deterministic
   * pattern that reliably extracts an arbitrary active-ingredient name
   * (an open vocabulary, unlike strength/form/quantity, which follow fixed
   * GS1/pharma-label conventions) from raw OCR text without a curated
   * ingredient dictionary this project doesn't have. Candidate matching
   * doesn't need this field to work — it compares OCR text tokens directly
   * against each catalog entry's own `activeIngredient` string instead (see
   * `package-candidate-matching.ts`). Kept in the type (per spec §4's
   * required shape) so a future dictionary-based extractor has somewhere
   * to write real values without a type change.
   */
  ingredients?: string[];
  strengths?: OcrStrength[];
  /** Normalized form token (`TABLET`, `CAPSULE`, `SYRUP`, `SUSPENSION`, `CREAM`, `GEL`, `SPRAY`, `DROPS`, `SACHET`, `AMPOULE`, `VIAL`), or `undefined` if no known form keyword was found. */
  pharmaceuticalForm?: string;
  /** Total unit count read from a package-quantity pattern (`BTX30` → 30, `2 x 10` → 20, `30 CAPS` → 30), or `undefined` if none matched. */
  packageQuantity?: number;
  /** The raw substring that produced `packageQuantity`, kept for display/debugging (e.g. "BTX30"). */
  packageText?: string;
  /**
   * Not populated by this implementation. ML Kit's on-device Text
   * Recognition v2 API (the engine this task's native layer uses — see
   * `docs/architecture/medication-resolution-architecture.md` §21) does not
   * expose a single per-block confidence score the way its barcode
   * scanner's own decode does; fabricating one here would violate spec
   * §4's "do not fabricate fields" as much as any other field would.
   * Match confidence is instead expressed structurally, via
   * `package-candidate-matching.ts`'s explicit `OCR_HIGH_CONFIDENCE` /
   * `OCR_PARTIAL` / `OCR_AMBIGUOUS` / `OCR_NOT_FOUND` states (spec §10),
   * which is what the UI and tests actually key off.
   */
  ocrConfidence?: number;
}

/**
 * GS1/pharma-label strength units this parser recognizes (spec §5) —
 * longest-alternative-first so `MG/ML` matches before the bare `MG`
 * alternative would otherwise win. Terminated with a negative lookahead
 * for a following letter/digit, NOT `\b`: `\b` only asserts a transition
 * between a word and non-word character, so it never matches right after
 * `%` (a non-word character followed by whitespace/end-of-string, also
 * non-word — no transition either side) — found by a real failing test
 * for "2.5 %", not assumed.
 */
const STRENGTH_PATTERN = /(\d+(?:[.,]\d+)?)\s*(MG\/ML|MCG\/ML|MG|MCG|IU|ML|G|%)(?![A-Za-z0-9])/gi;

/** Dosage-form keyword table (spec §5) — checked longest/most-specific pattern first (`F.C.TAB` before the bare `TAB` it would otherwise also match). Each entry's normalized output feeds both display and `package-candidate-matching.ts`'s form-to-catalog-vocabulary mapping. */
const FORM_PATTERNS: readonly [RegExp, string][] = [
  [/\bF\.?\s?C\.?\s?TAB(?:LET)?S?\b/i, "TABLET"],
  [/\bTABLETS?\b/i, "TABLET"],
  [/\bTAB\b/i, "TABLET"],
  [/\bCAPSULES?\b/i, "CAPSULE"],
  [/\bCAPS?\b/i, "CAPSULE"],
  [/\bSYRUP\b/i, "SYRUP"],
  [/\bSUSPENSION\b/i, "SUSPENSION"],
  [/\bCREAM\b/i, "CREAM"],
  [/\bGEL\b/i, "GEL"],
  [/\bSPRAY\b/i, "SPRAY"],
  [/\bDROPS?\b/i, "DROPS"],
  [/\bSACHETS?\b/i, "SACHET"],
  [/\bAMPOULES?\b/i, "AMPOULE"],
  [/\bVIALS?\b/i, "VIAL"],
];

/** `BTX30` / `BT X 30` — the common Greek-pharmacy-label "blister/box × count" shorthand. Checked before the generic `N x M` pattern so it isn't misread as a plain multiplication. */
const BTX_PATTERN = /\bBT\s*[xX]\s*(\d+)\b/;
/** `2 x 10` — two blisters of ten, total quantity is the product. */
const MULTIPLY_PATTERN = /\b(\d+)\s*[xX]\s*(\d+)\b/;
/** `30 CAPS` / `20 TABLETS` / `30 PCS` — a bare count followed by a unit-of-count word. */
const COUNT_PATTERN = /\b(\d+)\s*(?:CAPS?|CAPSULES?|TABS?|TABLETS?|PCS?|SACHETS?|AMPOULES?|VIALS?)\b/i;

/**
 * Case/diacritic-insensitive normalization for comparing OCR text against
 * catalog text (spec §6): uppercases, strips combining diacritical marks
 * (covers both Greek tonos/dialytika and Latin accents via the same
 * Unicode NFD decomposition — `docs/architecture/medication-resolution-
 * architecture.md`'s existing `immutable_unaccent` server-side does the
 * equivalent job for Postgres text search; this is the client-side,
 * dependency-free counterpart), and collapses whitespace runs. Never
 * rewrites one word into another (spec §6: "do not aggressively autocorrect
 * medication names into another medication name") — this is normalization
 * only, no fuzzy correction.
 */
// Unicode property escape for "Mark, nonspacing" — every combining
// diacritic (Greek tonos/dialytika, Latin accents alike) that NFD
// decomposition splits off from its base letter. Written as a `\p{}`
// property escape rather than an explicit codepoint-range character class
// so the source file never has to embed literal combining characters
// (which are exactly the kind of thing that silently corrupts across
// editors/encodings).
const COMBINING_MARKS = /\p{Mn}/gu;

export function normalizeOcrToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

function extractStrengths(text: string): OcrStrength[] | undefined {
  const matches = [...text.matchAll(STRENGTH_PATTERN)];
  if (matches.length === 0) return undefined;
  return matches.map((m) => ({ value: m[1].replace(",", "."), unit: m[2].toUpperCase() }));
}

function extractForm(text: string): string | undefined {
  for (const [pattern, normalized] of FORM_PATTERNS) {
    if (pattern.test(text)) return normalized;
  }
  return undefined;
}

function extractPackageQuantity(text: string): { quantity: number; matchedText: string } | undefined {
  const btx = BTX_PATTERN.exec(text);
  if (btx) return { quantity: Number(btx[1]), matchedText: btx[0] };

  const multiply = MULTIPLY_PATTERN.exec(text);
  if (multiply) return { quantity: Number(multiply[1]) * Number(multiply[2]), matchedText: multiply[0] };

  const count = COUNT_PATTERN.exec(text);
  if (count) return { quantity: Number(count[1]), matchedText: count[0] };

  return undefined;
}

/**
 * A line is not a useful brand guess if it's entirely consumed by
 * strength/form/quantity/pure-punctuation content — those are real,
 * already-extracted fields, not a product name. Requires at least two
 * consecutive letters so a bare "30" or "MG" line is rejected outright.
 */
// `\p{L}` (Unicode "Letter") rather than an explicit Greek codepoint range —
// same portability reasoning as `COMBINING_MARKS` above: no literal
// non-ASCII characters embedded in this source file.
const TWO_OR_MORE_LETTERS = /\p{L}{2,}/u;
const NON_LETTERS = /[^\p{L}]/gu;

function looksLikeNonBrandLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true;
  if (!TWO_OR_MORE_LETTERS.test(trimmed)) return true;
  const stripped = trimmed
    .replace(STRENGTH_PATTERN, " ")
    .replace(BTX_PATTERN, " ")
    .replace(MULTIPLY_PATTERN, " ")
    .replace(COUNT_PATTERN, " ")
    .replace(NON_LETTERS, "");
  for (const [pattern] of FORM_PATTERNS) {
    if (pattern.test(trimmed) && stripped.length <= 4) return true;
  }
  return stripped.length === 0;
}

function extractBrand(rawText: string): string | undefined {
  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!looksLikeNonBrandLine(trimmed)) return trimmed;
  }
  return undefined;
}

/**
 * Deterministically structures raw OCR text into `MedicationPackageOcrResult`
 * (spec §4/§5). Every extraction is an independent regex/keyword pass over
 * the same `rawText` — order between them doesn't matter, and a failure to
 * match one field never prevents another from being found.
 */
export function extractPackageOcrResult(rawText: string): MedicationPackageOcrResult {
  const strengths = extractStrengths(rawText);
  const pharmaceuticalForm = extractForm(rawText);
  const packageQuantityMatch = extractPackageQuantity(rawText);
  const brand = extractBrand(rawText);

  return {
    rawText,
    ...(brand ? { brand } : {}),
    ...(strengths ? { strengths } : {}),
    ...(pharmaceuticalForm ? { pharmaceuticalForm } : {}),
    ...(packageQuantityMatch
      ? { packageQuantity: packageQuantityMatch.quantity, packageText: packageQuantityMatch.matchedText }
      : {}),
  };
}
