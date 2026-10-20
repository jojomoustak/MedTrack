import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import type { TestableDb } from "@/lib/db/client";
import { completePasswordReset } from "@/lib/auth/password-reset";

/**
 * Against a real Postgres (`SYNC_IT_DATABASE_URL`, like
 * `lockout.integration.test.ts`): a completed reset confirms the email and
 * clears the lockout (2026-10-20).
 */
const connectionString = process.env.SYNC_IT_DATABASE_URL;

describe.skipIf(!connectionString)("completePasswordReset", () => {
  let pool: Pool;
  let db: TestableDb;

  beforeAll(() => {
    pool = new Pool({ connectionString });
    db = drizzle(pool, { schema });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedAccount(verifiedAt: string | null) {
    const accountId = randomUUID();
    await pool.query("INSERT INTO account (id, email, status, email_verified, email_verified_at) VALUES ($1, $2, 'active', $3, $4)", [
      accountId,
      `${accountId}@example.com`,
      verifiedAt !== null,
      verifiedAt,
    ]);
    await db.insert(schema.accountCredential).values({
      loginAccountId: accountId,
      credentialType: "password",
      passwordHash: "not-a-real-hash",
      failedLoginCount: 10,
      lockedUntil: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    return accountId;
  }

  async function read(accountId: string) {
    const [account] = await db.select().from(schema.account).where(eq(schema.account.id, accountId));
    const [credential] = await db.select().from(schema.accountCredential).where(eq(schema.accountCredential.loginAccountId, accountId));
    return { account, credential };
  }

  it("confirms an unconfirmed email and clears the lockout", async () => {
    const accountId = await seedAccount(null);

    await completePasswordReset(db, accountId);

    const { account, credential } = await read(accountId);
    expect(account.emailVerified).toBe(true);
    expect(account.emailVerifiedAt).not.toBeNull();
    expect(credential.failedLoginCount).toBe(0);
    expect(credential.lockedUntil).toBeNull();
  });

  it("keeps the date an email was first confirmed", async () => {
    const accountId = await seedAccount("2026-09-01T10:00:00.000Z");

    await completePasswordReset(db, accountId);

    const { account } = await read(accountId);
    expect(account.emailVerified).toBe(true);
    expect(new Date(account.emailVerifiedAt!).toISOString()).toBe("2026-09-01T10:00:00.000Z");
  });
});
