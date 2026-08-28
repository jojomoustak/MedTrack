/**
 * Greek national pharmaceutical EAN-13 decoding — pure, I/O-free domain
 * logic, the same shape as `lib/domain/gs1.ts` (Phase 1 §3: barcode
 * parsing is shared/TypeScript-only). See
 * `docs/architecture/medication-resolution-architecture.md` §2.5 for the
 * design this implements ("Path A").
 *
 * Confirmed structure (GS1 Greece's own standards page, verified
 * 2026-08-23 — see the architecture doc §2.3): a Greek pharmaceutical
 * barcode is a 13-digit EAN-13 of the form `280` + a 9-digit EOF product
 * code + a standard EAN-13 check digit. This is NOT a globally-resolvable
 * GTIN (GS1 Greece's own Verified by GS1 tool rejects `280`-prefixed
 * codes as out-of-scope "restricted circulation numbers" — architecture
 * doc §2.1) — it only has meaning as a deterministic encoding of an EOF
 * product code, decodable offline with no external dependency.
 *
 * This module does ONLY the decode. It has no knowledge of what the EOF
 * code resolves to — that's `MedicationCatalogProvider.lookupByEofCode`
 * (`lib/domain/catalog.ts`), a separate, I/O-having layer. Never combine
 * the two: this file must stay testable with zero network/DB access.
 */

const GREEK_PHARMA_PREFIX = "280";
const BARCODE_LENGTH = 13;
const EOF_CODE_LENGTH = 9;

export interface GreekNationalMedicineIdentifier {
  readonly kind: "GREEK_NATIONAL_EAN13";
  /** The full, original 13-digit barcode exactly as scanned — never re-derived or reformatted. */
  readonly barcode: string;
  /**
   * The 9-digit EOF product code embedded in the barcode (characters 4-12,
   * 1-indexed — `barcode.slice(3, 12)`). Kept as a string: leading zeros
   * are significant and must never be lost to numeric coercion (a real
   * EOF code like `023280101` is not the number `23280101`).
   */
  readonly eofCode: string;
}

/**
 * Standard EAN-13 check-digit algorithm (GS1 General Specifications §7.9):
 * alternating ×1/×3 weights over the first 12 digits, the check digit is
 * `(10 - (sum % 10)) % 10`. `first12Digits` must already be verified as
 * exactly 12 numeric characters before calling this — it does not
 * re-validate that itself.
 */
function computeEan13CheckDigit(first12Digits: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(first12Digits[i]);
    sum += i % 2 === 0 ? digit * 1 : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

function isValidEan13CheckDigit(barcode: string): boolean {
  return computeEan13CheckDigit(barcode.slice(0, 12)) === Number(barcode[12]);
}

/**
 * The reverse of `parseGreekNationalMedicineBarcode`: reconstructs the full
 * 13-digit barcode from a 9-digit EOF code (offline-index generation,
 * spec §12's "Device Offline Index" record shape includes `barcode`
 * alongside `eofCode` — precomputed server-side rather than making every
 * device redo check-digit arithmetic for display purposes). Returns `null`
 * if `eofCode` isn't exactly 9 digits — never pads, truncates, or guesses.
 */
export function computeGreekNationalBarcode(eofCode: string): string | null {
  if (!/^\d{9}$/.test(eofCode)) return null;
  const first12 = GREEK_PHARMA_PREFIX + eofCode;
  const checkDigit = computeEan13CheckDigit(first12);
  return first12 + String(checkDigit);
}

/**
 * Parses a raw scanned barcode string as a Greek national pharmaceutical
 * EAN-13, or returns `null` if it isn't one. Returning `null` covers three
 * distinct cases MedTracking must NOT distinguish for the caller (any of
 * them just means "this isn't a Path A code, try Path B instead" —
 * architecture doc §2.5's detection rule): wrong length/non-numeric, wrong
 * prefix, or a `280`-prefixed string that fails check-digit validation
 * (almost certainly a scan error, never treated as "close enough").
 *
 * Responsibilities deliberately excluded (architecture doc §2.5, §5): no
 * database access, no external API calls, no medication-name guessing, no
 * fuzzy matching. This function answers exactly one question — "is this a
 * well-formed Greek national medicine barcode, and if so what EOF code
 * does it encode" — nothing more.
 */
export function parseGreekNationalMedicineBarcode(barcode: string): GreekNationalMedicineIdentifier | null {
  if (!/^\d{13}$/.test(barcode)) return null; // exactly 13 numeric characters
  if (!barcode.startsWith(GREEK_PHARMA_PREFIX)) return null;
  if (barcode.length !== BARCODE_LENGTH) return null;
  if (!isValidEan13CheckDigit(barcode)) return null; // never resolve an invalid EAN-13 (spec §4)

  const eofCode = barcode.slice(3, 3 + EOF_CODE_LENGTH);
  return { kind: "GREEK_NATIONAL_EAN13", barcode, eofCode };
}
