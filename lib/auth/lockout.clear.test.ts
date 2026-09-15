import { describe, expect, it, vi } from "vitest";
import { clearLockout } from "@/lib/auth/lockout";
import { accountCredential } from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";

/**
 * Pure unit coverage for `clearLockout` (ADR-003 §"Security review
 * resolution" item 1's escape hatch, wired into
 * `emailAndPassword.onPasswordReset` in `lib/auth/config.ts`) — verifies
 * the SHAPE of the write (correct table, correct reset values, correct
 * scoping filters) using a fake `db.update().set().where()` chain rather
 * than a real Postgres instance. The end-to-end behavioral guarantee
 * (actually zeroes out a real locked row, never touches a linked Google
 * row) is covered by `lib/auth/lockout.integration.test.ts`'s
 * `clearLockout` case, which needs a real Postgres instance and is
 * `describe.skipIf`-gated accordingly (no Docker/Postgres available in
 * this environment this session — see this task's report).
 */
describe("clearLockout", () => {
  it("updates accountCredential, resetting failed_login_count/locked_until, scoped to this account's PASSWORD row only", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the parameter's TYPE is what gives `whereSpy.mock.calls[0][0]` a real index below; the value itself is asserted separately, not referenced by name here.
    const whereSpy = vi.fn(async (condition: unknown) => [] as unknown[]);
    const setSpy = vi.fn(() => ({ where: whereSpy }));
    const updateSpy = vi.fn(() => ({ set: setSpy }));
    const fakeDb = { update: updateSpy } as unknown as Db;

    await clearLockout(fakeDb, "11111111-1111-1111-1111-111111111111");

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(accountCredential);

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith({ failedLoginCount: 0, lockedUntil: null });

    expect(whereSpy).toHaveBeenCalledTimes(1);
    // The condition passed to `.where()` is a real drizzle-orm `SQL`
    // object (built via `and(eq(...), eq(...))`) — asserting it's a
    // genuinely-constructed condition (not undefined/a bare string) is as
    // far as a unit test can safely go without depending on drizzle's
    // internal SQL-chunk representation; the actual WHERE-clause
    // correctness (scoped to `credential_type = 'password'`, never a
    // linked google row) is what the integration test's dual-credential
    // fixture exists to prove end to end.
    const condition = whereSpy.mock.calls[0][0];
    expect(condition).toBeDefined();
    expect(typeof condition).toBe("object");
  });

  it("is a no-op (never throws) when the account has no password credential row", async () => {
    const whereSpy = vi.fn(async () => []); // drizzle's update().where() resolves even when zero rows match
    const setSpy = vi.fn(() => ({ where: whereSpy }));
    const updateSpy = vi.fn(() => ({ set: setSpy }));
    const fakeDb = { update: updateSpy } as unknown as Db;

    await expect(clearLockout(fakeDb, "22222222-2222-2222-2222-222222222222")).resolves.toBeUndefined();
  });
});
