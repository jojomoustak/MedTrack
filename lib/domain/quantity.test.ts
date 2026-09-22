import { describe, expect, it } from "vitest";
import { formatQuantity } from "@/lib/domain/quantity";

describe("formatQuantity", () => {
  it("trims a Postgres numeric column's full declared scale", () => {
    expect(formatQuantity("500.000")).toBe("500");
    expect(formatQuantity("1.000")).toBe("1");
    expect(formatQuantity("1000.000")).toBe("1000");
  });

  it("keeps genuinely meaningful decimals", () => {
    expect(formatQuantity("0.500")).toBe("0.5");
    expect(formatQuantity("1.250")).toBe("1.25");
    expect(formatQuantity("12.100")).toBe("12.1");
  });

  it("leaves an integer-looking value (no decimal point) untouched", () => {
    expect(formatQuantity("12")).toBe("12");
  });

  it("handles negative values (inventory transaction deltas)", () => {
    expect(formatQuantity("-12.000")).toBe("-12");
    expect(formatQuantity("-0.500")).toBe("-0.5");
  });

  it("returns non-numeric-looking input unchanged rather than guessing", () => {
    expect(formatQuantity("")).toBe("");
    expect(formatQuantity("abc")).toBe("abc");
  });
});
