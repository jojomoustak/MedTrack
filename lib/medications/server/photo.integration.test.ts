/**
 * Integration test against a REAL Postgres instance — same skip-by-default
 * pattern as `lib/sync/server/mutations.integration.test.ts` (see that
 * file's header for how to run this for real, `SYNC_IT_DATABASE_URL`).
 * `@vercel/blob` is mocked (no real `BLOB_READ_WRITE_TOKEN` in CI/dev) —
 * this test exists to prove the REAL authorization query (the part that
 * genuinely can't be trusted to a mock): a profile can never reach
 * another profile's medication photo, proven against real rows in a real
 * database, not just asserted in a unit test with a fake `Db`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import type { TestableDb } from "@/lib/db/client";
import { NotFoundError } from "@/lib/errors/app-error";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({ pathname, url: `https://example.blob.vercel-storage.com/${pathname}` })),
  get: vi.fn(),
  del: vi.fn().mockResolvedValue(undefined),
}));

import { del } from "@vercel/blob";
import { deleteMedicationPhoto, getMedicationPhoto, uploadMedicationPhoto } from "@/lib/medications/server/photo";

const connectionString = process.env.SYNC_IT_DATABASE_URL;

describe.skipIf(!connectionString)("medication photo authorization — real Postgres", () => {
  let pool: Pool;
  let db: TestableDb;

  beforeAll(() => {
    process.env.BLOB_READ_WRITE_TOKEN ??= "test-only-token";
    pool = new Pool({ connectionString });
    db = drizzle(pool, { schema });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedProfileWithMedication() {
    const accountId = randomUUID();
    const profileId = randomUUID();
    const userMedicationId = randomUUID();
    await db.insert(schema.account).values({ id: accountId, email: `photo-${accountId}@example.com`, status: "active" });
    await db.insert(schema.profile).values({ id: profileId, ownerAccountId: accountId });
    await db.insert(schema.userMedication).values({
      id: userMedicationId,
      profileId,
      customName: "Ασπιρίνη",
      inventoryUnit: "tablet",
      clientMutationId: randomUUID(),
    });
    return { profileId, userMedicationId };
  }

  it("a profile can upload and then retrieve its OWN medication's photo", async () => {
    const { profileId, userMedicationId } = await seedProfileWithMedication();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

    await uploadMedicationPhoto({ profileId, userMedicationId, file: { bytes, contentType: "image/jpeg", size: bytes.length } }, db);

    const [row] = await db.select().from(schema.userMedication).where(eq(schema.userMedication.id, userMedicationId));
    expect(row.photoBlobKey).toBeTruthy();
  });

  it("a DIFFERENT profile cannot upload, retrieve, or delete a photo for a medication it doesn't own — NotFoundError, not the real row", async () => {
    const owner = await seedProfileWithMedication();
    const intruderAccountId = randomUUID();
    const intruderProfileId = randomUUID();
    await db.insert(schema.account).values({ id: intruderAccountId, email: `intruder-${intruderAccountId}@example.com`, status: "active" });
    await db.insert(schema.profile).values({ id: intruderProfileId, ownerAccountId: intruderAccountId });

    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    await expect(
      uploadMedicationPhoto(
        { profileId: intruderProfileId, userMedicationId: owner.userMedicationId, file: { bytes, contentType: "image/jpeg", size: bytes.length } },
        db,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(getMedicationPhoto({ profileId: intruderProfileId, userMedicationId: owner.userMedicationId }, db)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(deleteMedicationPhoto({ profileId: intruderProfileId, userMedicationId: owner.userMedicationId }, db)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    // The owner's row must be completely untouched by the intruder's attempts.
    const [row] = await db.select().from(schema.userMedication).where(eq(schema.userMedication.id, owner.userMedicationId));
    expect(row.photoBlobKey).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });
});
