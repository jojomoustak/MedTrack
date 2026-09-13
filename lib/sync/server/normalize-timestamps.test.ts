import { describe, expect, it } from "vitest";
import { normalizeTimestampsInRecord } from "@/lib/sync/server/normalize-timestamps";

describe("normalizeTimestampsInRecord", () => {
  it("converts a Postgres timestamptz string to ISO 8601", () => {
    const result = normalizeTimestampsInRecord({ scheduledAt: "2026-09-13 21:24:00+00" });
    expect(result?.scheduledAt).toBe("2026-09-13T21:24:00.000Z");
  });

  it("converts a Postgres timestamptz string with fractional seconds", () => {
    const result = normalizeTimestampsInRecord({ createdAt: "2026-09-13 11:56:01.983781+00" });
    expect(result?.createdAt).toBe("2026-09-13T11:56:01.983Z");
  });

  it("leaves an already-ISO string untouched", () => {
    const result = normalizeTimestampsInRecord({ scheduledAt: "2026-09-13T21:24:00.000Z" });
    expect(result?.scheduledAt).toBe("2026-09-13T21:24:00.000Z");
  });

  it("leaves non-timestamp strings and other value types untouched", () => {
    const result = normalizeTimestampsInRecord({ name: "Depon", quantity: 3, active: true, deletedAt: null });
    expect(result).toEqual({ name: "Depon", quantity: 3, active: true, deletedAt: null });
  });

  it("passes through null and undefined records", () => {
    expect(normalizeTimestampsInRecord(null)).toBeNull();
    expect(normalizeTimestampsInRecord(undefined)).toBeUndefined();
  });

  it("normalizes every matching field in a multi-field record", () => {
    const result = normalizeTimestampsInRecord({
      id: "abc-123",
      scheduledAt: "2026-09-13 21:24:00+00",
      reminderAt: "2026-09-13 21:24:00+00",
      takenAt: null,
      status: "scheduled",
    });
    expect(result).toEqual({
      id: "abc-123",
      scheduledAt: "2026-09-13T21:24:00.000Z",
      reminderAt: "2026-09-13T21:24:00.000Z",
      takenAt: null,
      status: "scheduled",
    });
  });
});
