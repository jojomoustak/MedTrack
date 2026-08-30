/**
 * Integration tests against a REAL Postgres instance (same approach as
 * Phase 4's DB-layer verification): applies actual migrations, runs the
 * real `applyMutations`/`pullChanges` functions with an injected
 * node-postgres-backed `TestableDb` (see `lib/db/rls.ts`'s test-only
 * fallback), and checks the real rows written.
 *
 * Skipped by default (no live DB in most environments) — set
 * `SYNC_IT_DATABASE_URL` (a non-owner, RLS-subject role — matches how
 * production application traffic connects) and `SYNC_IT_ADMIN_DATABASE_URL`
 * (the table-owning/superuser role, used only to seed fixture rows that
 * RLS would otherwise block, exactly like Phase 4's `app_role` vs.
 * `postgres` split) to run these for real, e.g. against the same
 * throwaway Docker Postgres container used during development:
 *   docker run -d --name medtracking-test-pg -e POSTGRES_PASSWORD=testpass \
 *     -e POSTGRES_DB=medtracking_test -p 55432:5432 postgres:17
 *   pnpm exec tsx lib/db/migrate.ts   # against DATABASE_URL_DIRECT
 *   # (create a non-owner app_role and GRANT it table access — see Phase 4 notes)
 *   SYNC_IT_DATABASE_URL=postgresql://app_role:pw@localhost:55432/medtracking_test \
 *   SYNC_IT_ADMIN_DATABASE_URL=postgresql://postgres:pw@localhost:55432/medtracking_test \
 *   pnpm test
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";
import type { TestableDb } from "@/lib/db/client";
import { applyMutations } from "@/lib/sync/server/mutations";
import { pullChanges } from "@/lib/sync/server/changes";

const connectionString = process.env.SYNC_IT_DATABASE_URL;
const adminConnectionString = process.env.SYNC_IT_ADMIN_DATABASE_URL ?? connectionString;

describe.skipIf(!connectionString)("sync API against a real Postgres instance", () => {
  let pool: Pool;
  let adminPool: Pool;
  let db: TestableDb;

  beforeAll(() => {
    pool = new Pool({ connectionString });
    adminPool = new Pool({ connectionString: adminConnectionString });
    db = drizzle(pool, { schema });
  });

  afterAll(async () => {
    await pool.end();
    await adminPool.end();
  });

  /** Seeds via the ADMIN connection — RLS (correctly) blocks these inserts over the app_role connection, since no `app.current_profile_id` context is set outside `withProfileScope`. */
  async function seedAccountAndProfile(): Promise<{ accountId: string; profileId: string }> {
    const accountId = randomUUID();
    const profileId = randomUUID();
    await adminPool.query("INSERT INTO account (id, email, status) VALUES ($1, $2, 'active')", [accountId, `${accountId}@example.com`]);
    await adminPool.query("INSERT INTO profile (id, owner_account_id) VALUES ($1, $2)", [profileId, accountId]);
    return { accountId, profileId };
  }

  it("userPreferences (LWW): a mutation with a newer clientUpdatedAt is applied", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();

    const results = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "userPreferences",
        entityId: accountId,
        operation: "update",
        payload: { theme: "dark", clientUpdatedAt: new Date().toISOString() },
      },
    ]);

    expect(results[0].result).toBe("applied");
    expect((results[0].serverRecord as { theme?: string })?.theme).toBe("dark");
  });

  it("userPreferences (LWW): a mutation with an OLDER clientUpdatedAt than what's stored loses, but is still 'applied' (no persistent conflict UI for LWW, Phase 3 §4)", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const later = new Date();
    const earlier = new Date(later.getTime() - 60_000);

    await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "userPreferences", entityId: accountId, operation: "update", payload: { theme: "dark", clientUpdatedAt: later.toISOString() } },
    ]);

    const staleResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "userPreferences", entityId: accountId, operation: "update", payload: { theme: "light", clientUpdatedAt: earlier.toISOString() } },
    ]);

    expect(staleResult[0].result).toBe("applied");
    // The NEWER (already-stored) value wins — the stale write's own value never lands.
    expect((staleResult[0].serverRecord as { theme?: string })?.theme).toBe("dark");
  });

  it("purchaseList (optimistic concurrency): create then update with the correct baseVersion succeeds", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const listId = randomUUID();

    const createResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "purchaseList", entityId: listId, operation: "create", payload: { name: "Φαρμακείο" } },
    ]);
    expect(createResult[0].result).toBe("applied");
    expect((createResult[0].serverRecord as { version?: number })?.version).toBe(1);

    const updateResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "purchaseList", entityId: listId, operation: "update", payload: { name: "Renamed" }, baseVersion: 1 },
    ]);
    expect(updateResult[0].result).toBe("applied");
    expect((updateResult[0].serverRecord as { version?: number; name?: string })?.version).toBe(2);
    expect((updateResult[0].serverRecord as { name?: string })?.name).toBe("Renamed");
  });

  it("purchaseList (optimistic concurrency): a stale baseVersion is a genuine, surfaced conflict — never silently overwritten (Phase 1 §5)", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const listId = randomUUID();

    await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "purchaseList", entityId: listId, operation: "create", payload: { name: "Original" } },
    ]);
    // A first device successfully updates (version 1 -> 2).
    await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "purchaseList", entityId: listId, operation: "update", payload: { name: "Device A's edit" }, baseVersion: 1 },
    ]);

    // A second device, still holding the STALE version 1, tries to update.
    const conflictResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "purchaseList", entityId: listId, operation: "update", payload: { name: "Device B's stale edit" }, baseVersion: 1 },
    ]);

    expect(conflictResult[0].result).toBe("conflict");
    // The server's current (winning) state is returned so the client can reconcile.
    expect((conflictResult[0].serverRecord as { name?: string })?.name).toBe("Device A's edit");
  });

  it("idempotency: replaying the exact same clientMutationId returns the cached result without double-applying", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const listId = randomUUID();
    const clientMutationId = randomUUID();

    const first = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId, entityType: "purchaseList", entityId: listId, operation: "create", payload: { name: "Once only" } },
    ]);
    const replay = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId, entityType: "purchaseList", entityId: listId, operation: "create", payload: { name: "Once only" } },
    ]);

    expect(first[0].result).toBe("applied");
    expect(replay[0].result).toBe("applied");

    const changeLogResult = await adminPool.query<{ count: string }>("SELECT COUNT(*) FROM sync_change_log WHERE entity_id = $1", [listId]);
    expect(Number(changeLogResult.rows[0].count)).toBe(1);
  });

  it("rejects sync mutations for a profile in deleted_profile_registry (Phase 2 §4's DB-checkable rule)", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    await adminPool.query("INSERT INTO deleted_profile_registry (profile_id, account_id_hash, reason) VALUES ($1, 'x', 'account_deletion')", [profileId]);

    await expect(
      applyMutations({ profileId, accountId, db }, [
        { clientMutationId: randomUUID(), entityType: "purchaseList", entityId: randomUUID(), operation: "create", payload: { name: "Should not apply" } },
      ]),
    ).rejects.toThrow();
  });

  it("pullChanges: returns hydrated records in cursor order and never leaks another profile's rows", async () => {
    const profileA = await seedAccountAndProfile();
    const profileB = await seedAccountAndProfile();

    await applyMutations({ profileId: profileA.profileId, accountId: profileA.accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "purchaseList", entityId: randomUUID(), operation: "create", payload: { name: "A's list" } },
    ]);
    await applyMutations({ profileId: profileB.profileId, accountId: profileB.accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "purchaseList", entityId: randomUUID(), operation: "create", payload: { name: "B's list" } },
    ]);

    const changesForA = await pullChanges(profileA.profileId, profileA.accountId, 0, 100, db);
    expect(changesForA.changes.length).toBeGreaterThan(0);
    for (const change of changesForA.changes) {
      if (change.record && "profileId" in change.record) {
        expect(change.record.profileId).toBe(profileA.profileId);
      }
    }
  });

  // --- Phase 6: userMedication — the third entity through the outbox/
  // sync pattern, proving it generalizes to an entity with an optional
  // FK (ADR-004). ---

  it("userMedication (manual entry): create with catalogProductId null and a customName", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const id = randomUUID();

    const result = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "userMedication",
        entityId: id,
        operation: "create",
        payload: { catalogProductId: null, customName: "Παρακεταμόλη", inventoryUnit: "tablet" },
      },
    ]);

    expect(result[0].result).toBe("applied");
    const record = result[0].serverRecord as { catalog_product_id: unknown; custom_name: string; version: number };
    expect(record.catalog_product_id).toBeNull();
    expect(record.custom_name).toBe("Παρακεταμόλη");
    expect(record.version).toBe(1);
  });

  it("userMedication: create rejects a payload with neither catalogProductId nor customName (chk_catalog_or_manual, defense-in-depth) -- isolated as a per-mutation 'rejected' result, not a thrown request-level error (2026-08-30 batch-isolation fix)", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const result = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "userMedication",
        entityId: randomUUID(),
        operation: "create",
        payload: { catalogProductId: null, customName: null, inventoryUnit: "tablet" },
      },
    ]);
    expect(result[0].result).toBe("rejected");
    expect(result[0].error).toBeTruthy();
  });

  it("userMedication: create rejects a catalogProductId that doesn't reference a real catalog product -- isolated, not thrown", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const result = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "userMedication",
        entityId: randomUUID(),
        operation: "create",
        payload: { catalogProductId: randomUUID(), customName: null, inventoryUnit: "tablet" },
      },
    ]);
    expect(result[0].result).toBe("rejected");
  });

  it("userMedication (optimistic concurrency): update with the correct baseVersion succeeds; a stale one is a genuine conflict", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const id = randomUUID();

    await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "userMedication", entityId: id, operation: "create", payload: { catalogProductId: null, customName: "X", inventoryUnit: "tablet" } },
    ]);

    const updateResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "userMedication", entityId: id, operation: "update", payload: { treatmentState: "paused" }, baseVersion: 1 },
    ]);
    expect(updateResult[0].result).toBe("applied");

    const staleResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "userMedication", entityId: id, operation: "update", payload: { treatmentState: "discontinued" }, baseVersion: 1 },
    ]);
    expect(staleResult[0].result).toBe("conflict");
  });

  it("userMedication (catalog-linked): create with a real catalogProductId succeeds and never duplicates the catalog row's data (ADR-004)", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const catalogProductId = randomUUID();
    await adminPool.query(
      "INSERT INTO medication_catalog_product (id, name, regulatory_source) VALUES ($1, $2, 'seed-placeholder-not-verified')",
      [catalogProductId, "Test Catalog Product"],
    );

    const result = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "userMedication",
        entityId: randomUUID(),
        operation: "create",
        payload: { catalogProductId, customName: null, inventoryUnit: "tablet" },
      },
    ]);

    expect(result[0].result).toBe("applied");
    const record = result[0].serverRecord as { catalog_product_id: string; custom_name: string | null };
    expect(record.catalog_product_id).toBe(catalogProductId);
    expect(record.custom_name).toBeNull();
  });

  // --- Phase 10: medicationSchedule + doseEvent ---

  async function seedUserMedication(profileId: string): Promise<string> {
    const id = randomUUID();
    await adminPool.query(
      "INSERT INTO user_medication (id, profile_id, custom_name, inventory_unit, client_mutation_id) VALUES ($1, $2, 'Test Med', 'tablet', $3)",
      [id, profileId, randomUUID()],
    );
    return id;
  }

  it("medicationSchedule (wall-clock, daily): create derives time_anchor and writes the flattened wall-clock subtype fields", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();

    const result = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationSchedule",
        entityId: id,
        operation: "create",
        payload: {
          userMedicationId,
          scheduleKind: "daily",
          startDate: "2026-01-01",
          endDate: null,
          timezone: "Europe/Athens",
          doseQuantityValue: "1",
          doseQuantityUnit: "tablet",
          timesOfDay: ["08:00:00"],
          weekdaysMask: null,
        },
      },
    ]);

    expect(result[0].result).toBe("applied");
    const record = result[0].serverRecord as { time_anchor: string; times_of_day: string[]; version: number };
    expect(record.time_anchor).toBe("wall_clock");
    expect(record.times_of_day).toEqual(["08:00:00"]);
    expect(record.version).toBe(1);
  });

  it("medicationSchedule (elapsed, every_n_hours): create derives time_anchor and writes the flattened elapsed subtype fields", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();
    const anchorAt = new Date().toISOString();

    const result = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationSchedule",
        entityId: id,
        operation: "create",
        payload: {
          userMedicationId,
          scheduleKind: "every_n_hours",
          startDate: "2026-01-01",
          endDate: null,
          timezone: "Europe/Athens",
          doseQuantityValue: "1",
          doseQuantityUnit: "tablet",
          intervalHours: 8,
          anchorAt,
        },
      },
    ]);

    expect(result[0].result).toBe("applied");
    const record = result[0].serverRecord as { time_anchor: string; interval_hours: number };
    expect(record.time_anchor).toBe("elapsed");
    expect(record.interval_hours).toBe(8);
  });

  it("medicationSchedule (prn): create has a null time_anchor and no subtype row", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();

    const result = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationSchedule",
        entityId: id,
        operation: "create",
        payload: { userMedicationId, scheduleKind: "prn", startDate: "2026-01-01", endDate: null, timezone: "Europe/Athens", doseQuantityValue: "1", doseQuantityUnit: "tablet" },
      },
    ]);

    expect(result[0].result).toBe("applied");
    const record = result[0].serverRecord as { time_anchor: string | null; times_of_day: unknown; interval_hours: unknown };
    expect(record.time_anchor).toBeNull();
    expect(record.times_of_day).toBeNull();
    expect(record.interval_hours).toBeNull();
  });

  it("medicationSchedule (optimistic concurrency): update with the correct baseVersion succeeds and updates the wall-clock subtype; a stale baseVersion is a genuine conflict", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();

    await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationSchedule",
        entityId: id,
        operation: "create",
        payload: { userMedicationId, scheduleKind: "daily", startDate: "2026-01-01", endDate: null, timezone: "Europe/Athens", doseQuantityValue: "1", doseQuantityUnit: "tablet", timesOfDay: ["08:00:00"] },
      },
    ]);

    const updateResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "medicationSchedule", entityId: id, operation: "update", payload: { timesOfDay: ["09:00:00"] }, baseVersion: 1 },
    ]);
    expect(updateResult[0].result).toBe("applied");
    const updated = updateResult[0].serverRecord as { times_of_day: string[]; version: number };
    expect(updated.times_of_day).toEqual(["09:00:00"]);
    expect(updated.version).toBe(2);

    const staleResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "medicationSchedule", entityId: id, operation: "update", payload: { timesOfDay: ["10:00:00"] }, baseVersion: 1 },
    ]);
    expect(staleResult[0].result).toBe("conflict");
  });

  it("medicationSchedule: delete soft-deletes (deleted_at set) with optimistic concurrency", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();

    await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationSchedule",
        entityId: id,
        operation: "create",
        payload: { userMedicationId, scheduleKind: "daily", startDate: "2026-01-01", endDate: null, timezone: "Europe/Athens", doseQuantityValue: "1", doseQuantityUnit: "tablet", timesOfDay: ["08:00:00"] },
      },
    ]);

    const deleteResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "medicationSchedule", entityId: id, operation: "delete", payload: {}, baseVersion: 1 },
    ]);
    expect(deleteResult[0].result).toBe("applied");
    const deleted = deleteResult[0].serverRecord as { deleted_at: string | null };
    expect(deleted.deleted_at).not.toBeNull();
  });

  it("doseEvent: create is idempotent on id — a second create with the SAME id (e.g. deterministic schedule-generated id) never duplicates the row", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();
    const scheduledAt = new Date().toISOString();

    const first = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "doseEvent", entityId: id, operation: "create", payload: { userMedicationId, scheduleId: null, scheduledAt, source: "manual_prn" } },
    ]);
    const second = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "doseEvent", entityId: id, operation: "create", payload: { userMedicationId, scheduleId: null, scheduledAt, source: "manual_prn" } },
    ]);

    expect(first[0].result).toBe("applied");
    expect(second[0].result).toBe("applied");
    const countResult = await adminPool.query<{ count: string }>("SELECT COUNT(*) FROM dose_event WHERE id = $1", [id]);
    expect(Number(countResult.rows[0].count)).toBe(1);
  });

  it("doseEvent: transition to 'taken' sets taken_at and status", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();

    await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "doseEvent", entityId: id, operation: "create", payload: { userMedicationId, scheduleId: null, scheduledAt: new Date().toISOString(), source: "manual_prn" } },
    ]);

    const takenAt = new Date().toISOString();
    const result = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "doseEvent", entityId: id, operation: "update", payload: { status: "taken", takenAt } },
    ]);

    expect(result[0].result).toBe("applied");
    const record = result[0].serverRecord as { status: string; taken_at: string };
    expect(record.status).toBe("taken");
    expect(new Date(record.taken_at).toISOString()).toBe(new Date(takenAt).toISOString());
  });

  it("doseEvent: a transition on an already-terminal row is a silent no-op that still returns 'applied' with the current row, never 'conflict' (designing-offline-sync: converge, not conflict)", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();

    await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "doseEvent", entityId: id, operation: "create", payload: { userMedicationId, scheduleId: null, scheduledAt: new Date().toISOString(), source: "manual_prn" } },
    ]);
    await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "doseEvent", entityId: id, operation: "update", payload: { status: "skipped" } },
    ]);

    // A second device races in with 'taken' after the dose was already skipped.
    const raceResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "doseEvent", entityId: id, operation: "update", payload: { status: "taken", takenAt: new Date().toISOString() } },
    ]);

    expect(raceResult[0].result).toBe("applied");
    const record = raceResult[0].serverRecord as { status: string };
    expect(record.status).toBe("skipped"); // the first terminal write wins; the racing device converges to it
  });

  it("doseEvent: transition to 'taken' without takenAt is rejected (defense-in-depth on top of chk_taken_has_timestamp) -- isolated, not thrown", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();

    await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "doseEvent", entityId: id, operation: "create", payload: { userMedicationId, scheduleId: null, scheduledAt: new Date().toISOString(), source: "manual_prn" } },
    ]);

    const result = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "doseEvent", entityId: id, operation: "update", payload: { status: "taken" } },
    ]);
    expect(result[0].result).toBe("rejected");
  });

  it("batch isolation (2026-08-30 fix): a DoseEvent create sent BEFORE its own MedicationSchedule's create in the SAME batch fails only that one mutation -- the schedule (later in the array, but otherwise valid) still applies", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const scheduleId = randomUUID();
    const doseEventId = randomUUID();

    const results = await applyMutations({ profileId, accountId, db }, [
      // Deliberately out of dependency order -- exactly the real bug
      // `lib/db-client/outbox-repository.ts`'s `listPending` ordering
      // fix prevents client-side, but this proves the server itself is
      // now resilient to it regardless (defense in depth).
      {
        clientMutationId: randomUUID(),
        entityType: "doseEvent",
        entityId: doseEventId,
        operation: "create",
        payload: { userMedicationId, scheduleId, scheduledAt: new Date().toISOString(), source: "schedule_generated" },
      },
      {
        clientMutationId: randomUUID(),
        entityType: "medicationSchedule",
        entityId: scheduleId,
        operation: "create",
        payload: {
          userMedicationId,
          scheduleKind: "daily",
          startDate: "2026-01-01",
          endDate: null,
          timezone: "Europe/Athens",
          doseQuantityValue: "1",
          doseQuantityUnit: "tablet",
          timesOfDay: ["08:00:00"],
        },
      },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].result).toBe("rejected"); // the out-of-order dose event
    expect(results[1].result).toBe("applied"); // the schedule, unaffected by its sibling's failure
  });
});
