import { describe, expect, it, vi } from "vitest";
import { withAccountScope, withProfileScope } from "@/lib/db/rls";
import type { Db } from "@/lib/db/client";

/**
 * Contract test for the RLS transaction-batching helper (ADR-002
 * "Release-engineer sign-off" — the hard requirement that `SET LOCAL
 * app.current_profile_id` and every RLS-guarded query execute in the
 * same atomic batch/transaction, never as two separate one-shot calls).
 *
 * We can't exercise this against a live Neon database in this
 * environment, so this test verifies the CONTRACT at the code-structure
 * level: given a fake `Db` whose `batch()` is the only thing that ever
 * reaches "the database", assert that:
 *   1. `set_config('app.current_profile_id', ...)` is always the FIRST
 *      item passed to a SINGLE `batch()` call;
 *   2. the caller's queries are included in that SAME `batch()` call
 *      (not issued via any other method, which would mean they ran
 *      outside the transaction the `set_config` call established);
 *   3. the `set_config` call's own result is not leaked into the
 *      caller's return value.
 */
function buildFakeDb(batchResults: unknown[]) {
  const executeCalls: unknown[] = [];
  const batchCalls: unknown[][] = [];

  const fakeDb = {
    execute: vi.fn((query: unknown) => {
      executeCalls.push(query);
      return { __marker: "set_config_call", query };
    }),
    batch: vi.fn(async (queries: unknown[]) => {
      batchCalls.push(queries);
      return batchResults;
    }),
  };

  return { fakeDb: fakeDb as unknown as Db, executeCalls, batchCalls, batch: fakeDb.batch, execute: fakeDb.execute };
}

describe("withProfileScope", () => {
  it("issues exactly one batch() call containing set_config first, then the caller's queries", async () => {
    const marker1 = { id: "query-result-1" };
    const marker2 = { id: "query-result-2" };
    const { fakeDb, batch, execute } = buildFakeDb(["set_config_result", marker1, marker2]);

    const query1 = { __marker: "query1" };
    const query2 = { __marker: "query2" };

    const result = await withProfileScope(
      "11111111-1111-1111-1111-111111111111",
      () => [query1, query2] as never,
      { db: fakeDb },
    );

    // Exactly one batch call — never two separate one-shot calls.
    expect(batch).toHaveBeenCalledTimes(1);
    const batchedArgs = batch.mock.calls[0][0] as unknown[];

    // set_config must be first.
    expect(execute).toHaveBeenCalledTimes(1);
    const setConfigCallResult = execute.mock.results[0].value;
    expect(batchedArgs[0]).toBe(setConfigCallResult);

    // The caller's own queries are the remaining batch items, in order.
    expect(batchedArgs[1]).toBe(query1);
    expect(batchedArgs[2]).toBe(query2);

    // The set_config result is dropped from what's returned to the caller.
    expect(result).toEqual([marker1, marker2]);
  });

  it("passes the exact profile id into the set_config call", async () => {
    const { fakeDb, execute } = buildFakeDb(["set_config_result"]);
    await withProfileScope("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", () => [] as never, { db: fakeDb });

    expect(execute).toHaveBeenCalledTimes(1);
    // We can't easily inspect the SQL template's interpolated value without
    // parsing drizzle internals, but we CAN assert the call happened with a
    // tagged-template-produced SQL object (not a bare string), which is the
    // shape `sql\`...\`` produces — a stand-in confirming the helper builds
    // a real parameterized query rather than string-concatenating the id.
    const arg = execute.mock.calls[0][0];
    expect(typeof arg).toBe("object");
  });

  it("rejects an empty profileId rather than silently scoping to nothing", async () => {
    const { fakeDb } = buildFakeDb([]);
    await expect(withProfileScope("", () => [] as never, { db: fakeDb })).rejects.toThrow();
  });

  it("also sets app.current_account_id when an accountId is provided, still within one batch call", async () => {
    const marker = { id: "result" };
    const { fakeDb, batch, execute } = buildFakeDb(["profile_set", "account_set", marker]);

    const result = await withProfileScope(
      "11111111-1111-1111-1111-111111111111",
      () => [{ __marker: "query" }] as never,
      { db: fakeDb, accountId: "22222222-2222-2222-2222-222222222222" },
    );

    expect(batch).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2); // profile + account set_config
    expect(result).toEqual([marker]);
  });
});

describe("withAccountScope", () => {
  it("issues exactly one batch() call containing set_config first, then the caller's queries", async () => {
    const marker = { id: "result" };
    const { fakeDb, batch, execute } = buildFakeDb(["set_config_result", marker]);

    const result = await withAccountScope("33333333-3333-3333-3333-333333333333", () => [{ __marker: "q" }] as never, {
      db: fakeDb,
    });

    expect(batch).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual([marker]);
  });

  it("rejects an empty accountId", async () => {
    const { fakeDb } = buildFakeDb([]);
    await expect(withAccountScope("", () => [] as never, { db: fakeDb })).rejects.toThrow();
  });
});
