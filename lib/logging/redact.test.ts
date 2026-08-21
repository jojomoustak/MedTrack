import { describe, expect, it } from "vitest";
import { pseudonymize, redact } from "@/lib/logging/redact";

describe("redact (Phase 1 risk R12 — enforced by code, not convention)", () => {
  it("redacts top-level keys that look like health/medication data", () => {
    const result = redact({
      medicationName: "Amoxicillin 500mg",
      doseQuantity: 2,
      notes: "patient reports nausea",
      requestId: "abc-123",
    }) as Record<string, unknown>;

    expect(result.medicationName).toBe("[redacted]");
    expect(result.doseQuantity).toBe("[redacted]");
    expect(result.notes).toBe("[redacted]");
    // Non-sensitive metadata passes through untouched.
    expect(result.requestId).toBe("abc-123");
  });

  it("redacts nested health/secret data regardless of depth", () => {
    const result = redact({
      event: "sync.mutation.applied",
      payload: {
        entity: { details: { doseQuantityValue: 5, medicationCatalogProductId: "x" } },
      },
    }) as Record<string, unknown>;

    const payload = result.payload as Record<string, unknown>;
    const entity = payload.entity as Record<string, unknown>;
    const details = entity.details as Record<string, unknown>;
    expect(details.doseQuantityValue).toBe("[redacted]");
    expect(details.medicationCatalogProductId).toBe("[redacted]");
  });

  it("redacts an entire nested object when ITS OWN key matches the denylist (e.g. a 'schedule' wrapper), not just leaf keys", () => {
    const result = redact({
      payload: { schedule: { doseQuantityValue: 5 } },
    }) as Record<string, unknown>;
    const payload = result.payload as Record<string, unknown>;
    expect(payload.schedule).toBe("[redacted]");
  });

  it("redacts secrets/credentials/session material", () => {
    const result = redact({
      password: "hunter2",
      sessionTokenHash: "abcd",
      authorization: "Bearer xyz",
      ipHash: "deadbeef",
    }) as Record<string, unknown>;

    expect(result.password).toBe("[redacted]");
    expect(result.sessionTokenHash).toBe("[redacted]");
    expect(result.authorization).toBe("[redacted]");
    expect(result.ipHash).toBe("[redacted]");
  });

  it("converts Error objects to a safe summary without a stack trace", () => {
    const result = redact(new Error("boom")) as Record<string, unknown>;
    expect(result.message).toBe("boom");
    expect(result).not.toHaveProperty("stack");
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => redact(obj)).not.toThrow();
  });

  it("bounds array length so a huge array can't blow up a log line", () => {
    const bigArray = Array.from({ length: 1000 }, (_, i) => i);
    const result = redact(bigArray) as unknown[];
    expect(result.length).toBeLessThan(1000);
  });

  it("pseudonymize is deterministic and never returns the raw input", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const first = pseudonymize(id);
    const second = pseudonymize(id);
    expect(first).toBe(second);
    expect(first).not.toContain(id);
  });
});
