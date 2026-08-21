/**
 * Money as integer cents — never floating point (CLAUDE.md rule 6,
 * Phase 2 §6). This is the single centralized place that converts between
 * the stored integer-cents representation and a display string; nothing
 * else in the codebase should do `/ 100` arithmetic on a price ad hoc.
 *
 * `Cents` is a branded type so a bare `number` can't be passed where a
 * cents value is expected without an explicit `toCents()`/cast — this
 * catches "accidentally passed euros" bugs at compile time.
 */

declare const CentsBrand: unique symbol;
export type Cents = number & { readonly [CentsBrand]: true };

export class MoneyError extends Error {}

/** Constructs a `Cents` value from a known-integer number of cents. Throws on non-integers or unsafe values. */
export function toCents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`Money amounts must be integer cents, got ${value}.`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Money amount ${value} exceeds the safe integer range.`);
  }
  return value as Cents;
}

/** Parses a decimal euro string/number (e.g. "12.50", 12.5) into integer cents, rounding to the nearest cent. */
export function fromDecimalEuros(value: string | number): Cents {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) {
    throw new MoneyError(`Cannot parse "${value}" as a money amount.`);
  }
  // Round at cent precision using integer math to avoid float drift.
  const cents = Math.round(numeric * 100);
  return toCents(cents);
}

export function addCents(a: Cents, b: Cents): Cents {
  return toCents(a + b);
}

export function subtractCents(a: Cents, b: Cents): Cents {
  return toCents(a - b);
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce<Cents>((total, v) => addCents(total, v), toCents(0));
}

/** Formats cents as a locale-aware currency string for display only (never re-parsed back into domain logic). */
export function formatCents(cents: Cents, currency = "EUR", locale = "el-GR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}
