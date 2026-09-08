import { describe, expect, it } from "vitest";
import { dateToParam, paramToDate } from "@/components/calendar/date-param";

describe("date-param", () => {
  it("round-trips a local date through dateToParam/paramToDate", () => {
    const original = new Date(2026, 8, 5); // Sep 5, 2026 (local)
    const param = dateToParam(original);
    expect(param).toBe("2026-09-05");
    const parsed = paramToDate(param);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(5);
  });

  it("falls back to today for a missing param", () => {
    const before = new Date();
    const parsed = paramToDate(null);
    expect(Math.abs(parsed.getTime() - before.getTime())).toBeLessThan(5000);
  });

  it("falls back to today for a malformed param", () => {
    const before = new Date();
    const parsed = paramToDate("not-a-date");
    expect(Math.abs(parsed.getTime() - before.getTime())).toBeLessThan(5000);
  });
});
