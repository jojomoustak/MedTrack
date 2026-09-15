import { describe, expect, it, vi, beforeEach } from "vitest";
import { ValidationError, InternalError } from "@/lib/errors/app-error";

const valuesMock = vi.fn().mockResolvedValue(undefined);
const insertMock = vi.fn(() => ({ values: valuesMock }));
vi.mock("@/lib/db/client", () => ({
  getDb: () => ({ insert: insertMock }),
}));

// Imported AFTER the mock so `toSafeErrorResponse` picks up the mocked `getDb`.
const { toSafeErrorResponse } = await import("@/lib/errors/http");

describe("toSafeErrorResponse — error_log persistence (Phase 15 Hardening observability)", () => {
  beforeEach(() => {
    insertMock.mockClear();
    valuesMock.mockClear();
  });

  it("does NOT persist an operational error (expected, routine failures aren't tracked)", async () => {
    await toSafeErrorResponse(new ValidationError("bad input"));
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("persists a non-operational error with redacted context", async () => {
    await toSafeErrorResponse(new InternalError(new Error("db exploded")), { route: "test.route", email: "user@example.com" });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const [row] = valuesMock.mock.calls[0];
    expect(row.code).toBe("INTERNAL_ERROR");
    expect(row.httpStatus).toBe(500);
    // `email` is a redaction-denylisted key (lib/logging/redact.ts) — must
    // never reach the persisted row verbatim (CLAUDE.md rule 8).
    expect(JSON.stringify(row.context)).not.toContain("user@example.com");
  });

  it("never throws past toSafeErrorResponse when the DB insert itself fails", async () => {
    valuesMock.mockRejectedValueOnce(new Error("connection reset"));
    const response = await toSafeErrorResponse(new InternalError());
    expect(response.status).toBe(500);
  });
});
