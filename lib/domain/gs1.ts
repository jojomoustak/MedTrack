/**
 * GS1/EAN barcode parsing — pure, I/O-free domain logic (Phase 1 §3: "GS1
 * barcode parsing... shared/TypeScript-only, even when triggered from a
 * native event. A native barcode scan returns a raw string across the
 * bridge; parsing and lookup happen in the shared layer"). Never assumes
 * every Application Identifier is present (Phase 1 §7 / Phase 0) — a real
 * package might carry only GTIN+expiry, only GTIN+batch, or (EAN
 * fallback) nothing beyond the GTIN itself.
 *
 * Scope: Application Identifiers 01 (GTIN), 17 (expiry), 10 (batch/lot),
 * 21 (serial) — the set this project's scan flow actually consumes
 * (Phase 1 §7). An AI outside this set stops further parsing rather than
 * guessing its length (GS1's variable-length AIs need a length table this
 * module deliberately doesn't carry the full version of); whatever was
 * already parsed before the unrecognized AI is kept.
 */

/** Mirrors the native bridge's fixed `format` contract exactly — see `lib/platform/mobile-platform.ts`. */
export type BarcodeFormat = "GS1_DATA_MATRIX" | "EAN_13" | "EAN_8" | "CODE_128" | "UNKNOWN";

export interface ParsedBarcode {
  /** The untouched raw string the scanner returned, for logging/debugging and as the ultimate fallback. */
  raw: string;
  format: BarcodeFormat;
  /** GTIN normalized to 14 digits (left-zero-padded), GS1's canonical storage form — `null` if no GTIN could be identified. */
  gtin: string | null;
  /** ISO 8601 date (`YYYY-MM-DD`) parsed from AI 17, or `null` if the barcode carries no expiry. */
  expiry: string | null;
  /** AI 10 batch/lot number, or `null` if absent. */
  batch: string | null;
  /** AI 21 serial number, or `null` if absent. */
  serial: string | null;
}

/** GS1 "FNC1" / Group Separator character (ASCII 29) — terminates a variable-length AI value when it isn't the last element of the message. */
const GROUP_SEPARATOR = "\x1d";

/** Best-effort strip of a leading GS1 DataMatrix symbology identifier (`]d2`) some scanner decoders prepend to the raw value ahead of the actual GS1 data. Harmless no-op if absent. */
const SYMBOLOGY_IDENTIFIER_PATTERN = /^\]d2/i;

const AI_GTIN = "01";
const AI_EXPIRY = "17";
const AI_BATCH = "10";
const AI_SERIAL = "21";

const GTIN_DIGITS = 14;
const EXPIRY_DIGITS = 6;

function emptyResult(raw: string, format: BarcodeFormat): ParsedBarcode {
  return { raw, format, gtin: null, expiry: null, batch: null, serial: null };
}

/** Left-zero-pads a plain numeric GTIN-8/12/13/14 string to GS1's canonical 14-digit form. Returns `null` for anything that isn't a plausible plain numeric GTIN (empty, non-digit, or longer than 14 digits). */
function normalizePlainGtin(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > GTIN_DIGITS || !/^\d+$/.test(trimmed)) return null;
  return trimmed.padStart(GTIN_DIGITS, "0");
}

/**
 * AI 17 is `YYMMDD`. GS1 General Specifications' century-pivot rule: a
 * two-digit year 00-50 is read as 20xx, 51-99 as 19xx (medication expiry
 * dates are always near-future, so the 19xx branch is theoretical here,
 * but implemented for spec-correctness rather than assuming it away). A
 * day of `00` means "last day of the given month" per the same spec
 * (packagers sometimes only track month-level expiry).
 */
function parseExpiry(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  let dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12) return null;

  const year = yy <= 50 ? 2000 + yy : 1900 + yy;
  if (dd === 0) {
    dd = new Date(Date.UTC(year, mm, 0)).getUTCDate(); // day 0 of next month = last day of this month
  }
  if (dd < 1 || dd > 31) return null;

  const date = new Date(Date.UTC(year, mm - 1, dd));
  // Date silently rolls over invalid combinations (e.g. Feb 30) rather than
  // erroring — reject anything that didn't round-trip to a real calendar date.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null;

  return `${String(year).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function parseGs1DataMatrix(rawValue: string): ParsedBarcode {
  let cursor = rawValue.replace(SYMBOLOGY_IDENTIFIER_PATTERN, "");
  if (cursor.startsWith(GROUP_SEPARATOR)) cursor = cursor.slice(1); // some decoders pass a leading FNC1 through literally

  let gtin: string | null = null;
  let expiry: string | null = null;
  let batch: string | null = null;
  let serial: string | null = null;

  while (cursor.length > 0) {
    const ai = cursor.slice(0, 2);
    const rest = cursor.slice(2);

    if (ai === AI_GTIN) {
      if (rest.length < GTIN_DIGITS || !/^\d{14}/.test(rest)) break; // truncated/malformed — stop rather than guess
      gtin = rest.slice(0, GTIN_DIGITS);
      cursor = rest.slice(GTIN_DIGITS);
      continue;
    }

    if (ai === AI_EXPIRY) {
      if (rest.length < EXPIRY_DIGITS) break;
      expiry = parseExpiry(rest.slice(0, EXPIRY_DIGITS));
      cursor = rest.slice(EXPIRY_DIGITS);
      continue;
    }

    if (ai === AI_BATCH || ai === AI_SERIAL) {
      // Variable-length: read up to the next FNC1/group separator, or to
      // the end of the string if this is the last element (GS1 never
      // requires a trailing separator on the final AI) — the classic spot
      // GS1 parsers get subtly wrong by either always requiring a
      // terminator or always assuming "rest of string."
      const separatorIndex = rest.indexOf(GROUP_SEPARATOR);
      const value = separatorIndex === -1 ? rest : rest.slice(0, separatorIndex);
      if (ai === AI_BATCH) batch = value.length > 0 ? value : null;
      else serial = value.length > 0 ? value : null;
      cursor = separatorIndex === -1 ? "" : rest.slice(separatorIndex + 1);
      continue;
    }

    // Unrecognized AI: this module only understands 01/17/10/21 (see
    // module doc). Stop rather than misinterpret the remainder as one of
    // the known fields — whatever was already parsed is still returned.
    break;
  }

  return { raw: rawValue, format: "GS1_DATA_MATRIX", gtin, expiry, batch, serial };
}

/**
 * Parses a raw barcode string per Phase 1 §7's flow: `EAN_13`/`EAN_8` are
 * themselves a bare GTIN (normalized/padded, no other fields);
 * `GS1_DATA_MATRIX` carries GS1 Application Identifiers; `CODE_128`/
 * `UNKNOWN` are treated as fully opaque — never guessed at.
 */
export function parseBarcode(rawValue: string, format: BarcodeFormat): ParsedBarcode {
  if (format === "EAN_13" || format === "EAN_8") {
    return { ...emptyResult(rawValue, format), gtin: normalizePlainGtin(rawValue) };
  }
  if (format === "GS1_DATA_MATRIX") {
    return parseGs1DataMatrix(rawValue);
  }
  // CODE_128 / UNKNOWN: opaque beyond the raw string (module doc / Phase 1 §7).
  return emptyResult(rawValue, format);
}
