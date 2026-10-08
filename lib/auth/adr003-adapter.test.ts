import { describe, expect, it } from "vitest";
import type { DBAdapter, Where } from "@better-auth/core/db/adapter";
import type { BetterAuthOptions } from "better-auth";
import { hashSessionToken, withHashedSessionTokenAdapter } from "@/lib/auth/adr003-adapter";

type Row = Record<string, unknown>;

/** Just enough of an adapter to exercise the wrapper: one in-memory table per model, equality `where` only. */
function fakeAdapterFactory() {
  const tables = new Map<string, Row[]>();
  const table = (model: string) => tables.get(model) ?? tables.set(model, []).get(model)!;
  const matches = (row: Row, where: Where[] = []) =>
    where.every((c) => {
      const v = row[c.field];
      if (c.operator === "in") return (c.value as unknown[]).includes(v);
      if (c.operator === "not_in") return !(c.value as unknown[]).includes(v);
      if (c.operator === "ne") return v !== c.value;
      return v === c.value;
    });
  const surface = {
    create: async ({ model, data }: { model: string; data: Row }) => {
      const row = { ...data };
      table(model).push(row);
      return { ...row };
    },
    findOne: async ({ model, where }: { model: string; where: Where[] }) => {
      const row = table(model).find((r) => matches(r, where));
      return row ? { ...row } : null;
    },
    findMany: async ({ model, where }: { model: string; where?: Where[] }) => table(model).filter((r) => matches(r, where)).map((r) => ({ ...r })),
    update: async ({ model, where, update }: { model: string; where: Where[]; update: Row }) => {
      const row = table(model).find((r) => matches(r, where));
      if (!row) return null;
      Object.assign(row, update);
      return { ...row };
    },
    updateMany: async () => 0,
    delete: async ({ model, where }: { model: string; where: Where[] }) => {
      tables.set(model, table(model).filter((r) => !matches(r, where)));
    },
    deleteMany: async () => 0,
    count: async () => 0,
  };
  const adapter = { ...surface, transaction: async <R,>(fn: (trx: typeof surface) => Promise<R>) => fn(surface) } as unknown as DBAdapter;
  return { factory: (() => adapter) as (options: BetterAuthOptions) => DBAdapter, tables };
}

const RAW = "rawSessionToken0123456789abcdefg";

async function setup() {
  const { factory, tables } = fakeAdapterFactory();
  const adapter = withHashedSessionTokenAdapter(factory)({} as BetterAuthOptions);
  const created = await adapter.create({ model: "session", data: { id: "s1", token: RAW, expiresAt: new Date(0) } });
  return { adapter, tables, created };
}

describe("withHashedSessionTokenAdapter", () => {
  it("stores only the hash, and hands the raw token back from create", async () => {
    const { tables, created } = await setup();
    expect(tables.get("session")![0].token).toBe(hashSessionToken(RAW));
    expect((created as Row).token).toBe(RAW);
  });

  it("finds a session by its raw token and returns the raw token, not the stored hash", async () => {
    const { adapter } = await setup();
    const found = (await adapter.findOne({ model: "session", where: [{ field: "token", value: RAW }] })) as Row | null;
    expect(found?.id).toBe("s1");
    expect(found?.token).toBe(RAW);
  });

  it("refreshes a session found by token — the daily refresh that used to sign users out", async () => {
    // Real bug (2026-10-08): Better Auth refreshes with `updateSession(found.token)`;
    // `found.token` was the stored hash, which got hashed again and matched
    // nothing, so Better Auth deleted the session cookie.
    const { adapter, tables } = await setup();
    const found = (await adapter.findOne({ model: "session", where: [{ field: "token", value: RAW }] })) as Row;
    const later = new Date(1_000_000);
    const updated = (await adapter.update({ model: "session", where: [{ field: "token", value: found.token as string }], update: { expiresAt: later } })) as Row | null;

    expect(updated).not.toBeNull();
    expect(updated?.token).toBe(RAW); // goes into the cookie — must never be the hash
    expect(tables.get("session")![0].expiresAt).toEqual(later);
    expect(tables.get("session")![0].token).toBe(hashSessionToken(RAW));
  });

  it("never accepts the stored hash itself as a token", async () => {
    const { adapter } = await setup();
    const viaHash = await adapter.findOne({ model: "session", where: [{ field: "token", value: hashSessionToken(RAW) }] });
    expect(viaHash).toBeNull();
  });

  it("applies the same conversion inside transactions", async () => {
    const { adapter } = await setup();
    const found = await adapter.transaction(async (trx) => (await trx.findOne({ model: "session", where: [{ field: "token", value: RAW }] })) as Row | null);
    expect(found?.token).toBe(RAW);
  });

  it("leaves other models untouched", async () => {
    const { adapter, tables } = await setup();
    await adapter.create({ model: "user", data: { id: "u1", token: "not-a-session" } });
    expect(tables.get("user")![0].token).toBe("not-a-session");
  });
});

describe("withHashedSessionTokenAdapter — hardening (security review, 2026-10-08)", () => {
  it("never lets the stored hash act as a token for update or delete either", async () => {
    const { adapter, tables } = await setup();
    const hash = hashSessionToken(RAW);
    expect(await adapter.update({ model: "session", where: [{ field: "token", value: hash }], update: { expiresAt: new Date(5) } })).toBeNull();
    await adapter.delete({ model: "session", where: [{ field: "token", value: hash }] });
    expect(tables.get("session")).toHaveLength(1);
  });

  it("returns null from an update that matches nothing", async () => {
    const { adapter } = await setup();
    expect(await adapter.update({ model: "session", where: [{ field: "token", value: "no-such-token" }], update: { expiresAt: new Date(5) } })).toBeNull();
  });

  it("keeps findMany results hashed — there is no raw token to restore", async () => {
    const { adapter } = await setup();
    const rows = (await adapter.findMany({ model: "session", where: [{ field: "id", value: "s1" }] })) as Row[];
    expect(rows[0].token).toBe(hashSessionToken(RAW));
  });

  it("hashes every element of an in / not_in list, so stored hashes never match there either", async () => {
    const { adapter } = await setup();
    expect(await adapter.findMany({ model: "session", where: [{ field: "token", operator: "in", value: [RAW] }] })).toHaveLength(1);
    expect(await adapter.findMany({ model: "session", where: [{ field: "token", operator: "in", value: [hashSessionToken(RAW)] }] })).toHaveLength(0);
  });

  it("refuses operators that can't mean anything against a hash", async () => {
    const { adapter } = await setup();
    await expect(adapter.findMany({ model: "session", where: [{ field: "token", operator: "starts_with", value: "raw" }] })).rejects.toThrow(/unsupported operator/i);
  });

  it("stores a token written by update hashed, and returns it raw", async () => {
    const { adapter, tables } = await setup();
    const updated = (await adapter.update({ model: "session", where: [{ field: "id", value: "s1" }], update: { token: "rotatedRawToken0123456789abcdefg" } })) as Row;
    expect(tables.get("session")![0].token).toBe(hashSessionToken("rotatedRawToken0123456789abcdefg"));
    expect(updated.token).toBe("rotatedRawToken0123456789abcdefg");
  });

  it("creates and updates through the same conversion inside a transaction", async () => {
    const { adapter, tables } = await setup();
    await adapter.transaction(async (trx) => {
      await trx.create({ model: "session", data: { id: "s2", token: "secondRawToken0123456789abcdefgh", expiresAt: new Date(0) } });
      await trx.update({ model: "session", where: [{ field: "token", value: "secondRawToken0123456789abcdefgh" }], update: { expiresAt: new Date(9) } });
    });
    const second = tables.get("session")!.find((r) => r.id === "s2")!;
    expect(second.token).toBe(hashSessionToken("secondRawToken0123456789abcdefgh"));
    expect(second.expiresAt).toEqual(new Date(9));
  });

  it("only restores a raw token onto the row it actually hashes to", async () => {
    // An inner adapter that answers with a different row than the token's
    // (as an OR-connected where could) must not get the caller's raw token
    // stamped onto it.
    const otherRow = { id: "s-other", token: hashSessionToken("someoneElsesToken0123456789abcde") };
    const misbehaving = (() =>
      ({
        findOne: async () => ({ ...otherRow }),
        transaction: async <R,>(fn: (trx: unknown) => Promise<R>) => fn({}),
      }) as unknown as DBAdapter) as (options: BetterAuthOptions) => DBAdapter;
    const adapter = withHashedSessionTokenAdapter(misbehaving)({} as BetterAuthOptions);
    const found = (await adapter.findOne({ model: "session", where: [{ field: "token", value: RAW }] })) as Row;
    expect(found.token).toBe(otherRow.token);
  });
});
