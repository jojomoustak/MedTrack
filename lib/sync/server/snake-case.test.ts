import { describe, expect, it } from "vitest";
import { toCamelCaseRecord } from "@/lib/sync/server/snake-case";

describe("toCamelCaseRecord", () => {
  it("converts snake_case keys to camelCase", () => {
    expect(toCamelCaseRecord({ profile_id: "x", scheduled_at: "y", id: "z" })).toEqual({
      profileId: "x",
      scheduledAt: "y",
      id: "z",
    });
  });

  it("handles keys with multiple underscores", () => {
    expect(toCamelCaseRecord({ dose_quantity_value: "1", client_mutation_id: "abc" })).toEqual({
      doseQuantityValue: "1",
      clientMutationId: "abc",
    });
  });

  it("leaves already-camelCase or single-word keys unchanged", () => {
    expect(toCamelCaseRecord({ id: "x", version: 1 })).toEqual({ id: "x", version: 1 });
  });

  it("preserves values as-is, including null, arrays, and nested objects", () => {
    expect(toCamelCaseRecord({ end_date: null, times_of_day: ["08:00"], nested_thing: { a: 1 } })).toEqual({
      endDate: null,
      timesOfDay: ["08:00"],
      nestedThing: { a: 1 },
    });
  });

  it("returns undefined for null or undefined input", () => {
    expect(toCamelCaseRecord(null)).toBeUndefined();
    expect(toCamelCaseRecord(undefined)).toBeUndefined();
  });
});
