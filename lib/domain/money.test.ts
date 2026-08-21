import { describe, expect, it } from "vitest";
import { MoneyError, addCents, formatCents, fromDecimalEuros, subtractCents, sumCents, toCents } from "@/lib/domain/money";

describe("money (integer cents, never floating point — CLAUDE.md rule 6)", () => {
  it("toCents accepts integers and rejects non-integers", () => {
    expect(toCents(1250)).toBe(1250);
    expect(() => toCents(12.5)).toThrow(MoneyError);
  });

  it("fromDecimalEuros converts a euro amount to integer cents without float drift", () => {
    expect(fromDecimalEuros("12.50")).toBe(1250);
    expect(fromDecimalEuros(0.1)).toBe(10);
    // The classic float trap: 0.1 + 0.2 !== 0.3 in raw JS floating point.
    // Money arithmetic must not inherit that — going through cents avoids it.
    const a = fromDecimalEuros(0.1);
    const b = fromDecimalEuros(0.2);
    expect(addCents(a, b)).toBe(30);
  });

  it("addCents/subtractCents operate on exact integers", () => {
    const a = toCents(1000);
    const b = toCents(250);
    expect(addCents(a, b)).toBe(1250);
    expect(subtractCents(a, b)).toBe(750);
  });

  it("sumCents totals a list of ledger-style entries exactly", () => {
    const values = [toCents(100), toCents(200), toCents(-50)];
    expect(sumCents(values)).toBe(250);
  });

  it("formatCents renders a locale-aware currency string for display only", () => {
    const formatted = formatCents(toCents(1234), "EUR", "en-US");
    expect(formatted).toContain("12.34");
  });

  it("rejects unsafe integer values", () => {
    expect(() => toCents(Number.MAX_SAFE_INTEGER + 10)).toThrow(MoneyError);
  });
});
