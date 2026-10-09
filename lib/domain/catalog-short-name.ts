/**
 * The everyday name of a catalog product — "FLAGYL 500mg" out of the
 * official description "FLAGYL CAPS 500MG/CAP BTX30" (2026-10-09, user
 * request: the full description only on the edit screen).
 *
 * Official EOF/Ministry descriptions follow one shape — brand, then a
 * dosage-form code, then the strength, then packaging:
 *
 *   CYMBALTA GR.CAP 30MG/CAP BTX28(BLISTERS)
 *   MAXARTAN F.C.TAB (50+12,5)MG/TAB BT x 28 (BLIST 2x14)
 *   PROCEF PD.ORA.SUS 250MG/5ML FLX60ML
 *
 * The form code is the anchor: everything before it is the brand, and
 * the token right after it is the strength. Both are copied, never
 * computed — the strength keeps its digits and decimal commas exactly as
 * the regulator wrote them, only its unit is lower-cased ("500MG" →
 * "500mg") and a per-unit suffix dropped ("/CAP", "/VIAL"; a per-volume
 * one such as "/5ML" stays, since it is part of the strength). A strength
 * too irregular to tidy is kept exactly as written, and a description
 * that doesn't fit the shape at all is returned unchanged rather than
 * guessed at: a longer name is harmless, a wrong or missing strength is
 * not.
 *
 * Checked against every description in the Ministry bulletins
 * (`data/raw/ministry/`, 9,433 names, 2026-10-09).
 */

/**
 * Dosage-form codes without a dot, as written in the bulletins — every
 * dotted code (F.C.TAB, INJ.SOL, C/S.SOL.IN, …) is recognised by its
 * shape instead (`DOTTED_FORM`).
 */
const PLAIN_FORMS = new Set([
  "TABLET",
  "TABLETS",
  "TAB",
  "CAPS",
  "CAP",
  "SYR",
  "TTS",
  "LOZ",
  "SUPP",
  "CREAM",
  "GRANULES",
  "OINTMENT",
  "GEL",
  "ENEMA",
  "FOAM",
  "PESS",
  "IMPLANT",
  "SPR",
  "LOT",
  "TINCT",
  "ELIX",
  "TOOTHPASTE",
]);

/** Abbreviated form codes: short upper-case segments with at least one dot between letters — F.C.TAB, EY.DR.S.SD, C/S.SOL.IN (not "HCL/B."). */
const DOTTED_FORM = /^(?=.*\.[A-Z])[A-Z]{1,6}(?:[./][A-Z]{1,6})+\.?$/;

const UNIT = "(?:MCG|MC|MG|ΜG|G|ML|IU|I\\.U\\.|U|MMOL|MEQ|MIU|KBQ|MBQ|%)";
const AMOUNT = "\\(?\\d[\\d.,+]*\\)?";
/** "500MG/CAP", "(50+12,5)MG/TAB", "12,5MG/0,6ML", "4%", "340MCG+12MCG". */
const STRENGTH = new RegExp(`^(${AMOUNT}${UNIT}(?:\\+\\d[\\d.,]*${UNIT})*)(?:/(\\S+))?$`, "i");
/** A per-volume (or per-mass) denominator stays part of the strength; anything else ("CAP", "VIAL", "DOSE") is the unit it's measured per. */
const KEEP_DENOMINATOR = /^\d*[.,]?\d*\s?(?:ML|L|G|KG|M2|H|24H)$/i;
/** Lower-cased in the short name; IU, U, %, and the rest are written as the regulator wrote them. */
const LOWERCASE_UNIT = new RegExp(`(\\d|\\))(MCG|MC|MG|ΜG|G|ML)(?=\\+|$)`, "gi");

function isForm(token: string): boolean {
  return PLAIN_FORMS.has(token) || DOTTED_FORM.test(token);
}

/**
 * A bracketed amount written with spaces inside ("(10 + 300 + 12,5)
 * MG/TAB") as one token, plus how many tokens it spanned.
 */
function bracketedAt(tokens: string[], at: number): { text: string; span: number } {
  const first = tokens[at] ?? "";
  if (!first.startsWith("(") || first.includes(")")) return { text: first, span: 1 };
  for (let end = at + 1; end < tokens.length && end < at + 12; end++) {
    if (tokens[end].includes(")")) return { text: tokens.slice(at, end + 1).join(" "), span: end - at + 1 };
  }
  return { text: first, span: 1 };
}

/** The tidied strength starting at `tokens[at]`, or null. "100 U/ML" and "(80+25) mg/TAB" are written with a space. */
function strengthAt(tokens: string[], at: number): string | null {
  const { text, span } = bracketedAt(tokens, at);
  const first = text.replace(/\s+/g, "");
  const candidates = new RegExp(`^${AMOUNT}$`).test(first) ? [`${first}${tokens[at + span] ?? ""}`, first] : [first];
  for (const candidate of candidates) {
    const match = candidate.match(STRENGTH);
    if (!match) continue;
    const amount = match[1].replace(LOWERCASE_UNIT, (_, before: string, unit: string) => `${before}${unit.toLowerCase().replace("μ", "m")}`);
    const per = match[2];
    return per !== undefined && KEEP_DENOMINATOR.test(per) ? `${amount}/${per.toLowerCase()}` : amount;
  }
  return null;
}

/**
 * A strength too irregular to tidy ("15000anti-XaIU/1,0ML",
 * "357(Fe+++100)MG/TAB", "1440 ELISA") is kept exactly as written rather
 * than dropped — it's often the only thing telling two products of one
 * brand apart.
 */
function rawStrengthAt(tokens: string[], at: number): string | null {
  const { text, span } = bracketedAt(tokens, at);
  // "(F.C.TAB x100 + F.C.TAB x20 + F.C.TAB x10)mg/CAP" — any digits in a bracketed group count.
  if (span > 1) return /\d/.test(text) ? text : null;
  if (!/^\(?\d/.test(text)) return null;
  if (/[A-Za-zΑ-Ωα-ω%]/.test(text)) return text;
  const second = tokens[at + 1];
  return second && /^[A-Za-zΑ-Ωα-ω(]/.test(second) ? `${text} ${second}` : null;
}

function brandBefore(tokens: string[], formIndex: number): string {
  // "TANTUM VERDE MOUTH SPR 0.30%": MOUTH is part of the form, not the brand.
  const end = tokens[formIndex - 1] === "MOUTH" && formIndex > 1 ? formIndex - 1 : formIndex;
  return tokens
    .slice(0, end)
    .join(" ")
    .replace(/[®™]/g, "")
    .trim();
}

export function shortCatalogName(fullName: string): string {
  const original = fullName.trim();
  const tokens = original.split(/\s+/);
  const formIndices = tokens.flatMap((token, i) => (i > 0 && isForm(token) ? [i] : []));
  if (formIndices.length === 0) return original;

  // The form code a strength follows wins ("STREPSILS ORANGE VIT.C LOZ
  // (1,2+0,6)MG/LOZ": VIT.C looks like a code but LOZ is the form).
  for (const formIndex of formIndices) {
    const strength = strengthAt(tokens, formIndex + 1);
    const brand = brandBefore(tokens, formIndex);
    if (strength && brand) return `${brand} ${strength}`;
  }
  const brand = brandBefore(tokens, formIndices[0]);
  if (!brand) return original;
  const raw = rawStrengthAt(tokens, formIndices[0] + 1);
  return raw ? `${brand} ${raw}` : brand;
}
