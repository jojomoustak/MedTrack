import { describe, expect, it } from "vitest";
import { compareTimestampsAscending, isTimestampAtOrAfter, isTimestampAtOrBefore, isTimestampBefore } from "@/lib/domain/timestamp";

describe("timestamp comparison helpers", () => {
  it("correctly compares a Postgres-format string against an ISO string on the same calendar date", () => {
    const postgresFormat = "2026-09-13 21:24:00+00"; // later today
    const isoCutoff = "2026-09-13T11:52:14.478Z"; // earlier today

    // A plain string comparison gets this backwards (space sorts before "T").
    expect(postgresFormat < isoCutoff).toBe(true);
    // The Date-based helpers get it right.
    expect(isTimestampBefore(postgresFormat, isoCutoff)).toBe(false);
    expect(isTimestampAtOrAfter(postgresFormat, isoCutoff)).toBe(true);
    expect(isTimestampAtOrBefore(isoCutoff, postgresFormat)).toBe(true);
  });

  it("still compares two ISO strings correctly", () => {
    expect(isTimestampBefore("2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z")).toBe(true);
    expect(isTimestampBefore("2026-09-02T00:00:00.000Z", "2026-09-01T00:00:00.000Z")).toBe(false);
  });

  it("compareTimestampsAscending sorts chronologically across mixed formats", () => {
    const values = ["2026-09-13 21:24:00+00", "2026-09-13T11:52:14.478Z", "2026-09-13 15:00:00+00"];
    const sorted = [...values].sort(compareTimestampsAscending);
    expect(sorted).toEqual(["2026-09-13T11:52:14.478Z", "2026-09-13 15:00:00+00", "2026-09-13 21:24:00+00"]);
  });
});
