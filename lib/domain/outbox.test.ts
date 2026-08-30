import { describe, expect, it } from "vitest";
import { nextOutboxSeq } from "@/lib/domain/outbox";

describe("nextOutboxSeq", () => {
  it("is strictly increasing even across many calls in the same tick (same millisecond)", () => {
    const values = Array.from({ length: 50 }, () => nextOutboxSeq());
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});
