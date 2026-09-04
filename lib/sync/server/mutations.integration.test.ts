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

  it("userMedication (manual entry): create with catalogProductId null and a customName -- serverRecord is camelCase (2026-08-30 snake_case fix), not raw Postgres column names", async () => {
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
    const record = result[0].serverRecord as { catalogProductId: unknown; customName: string; version: number };
    expect(record.catalogProductId).toBeNull();
    expect(record.customName).toBe("Παρακεταμόλη");
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
    const record = result[0].serverRecord as { catalogProductId: string; customName: string | null };
    expect(record.catalogProductId).toBe(catalogProductId);
    expect(record.customName).toBeNull();
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
    const record = result[0].serverRecord as { timeAnchor: string; timesOfDay: string[]; version: number };
    expect(record.timeAnchor).toBe("wall_clock");
    expect(record.timesOfDay).toEqual(["08:00:00"]);
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
    const record = result[0].serverRecord as { timeAnchor: string; intervalHours: number };
    expect(record.timeAnchor).toBe("elapsed");
    expect(record.intervalHours).toBe(8);
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
    const record = result[0].serverRecord as { timeAnchor: string | null; timesOfDay: unknown; intervalHours: unknown };
    expect(record.timeAnchor).toBeNull();
    expect(record.timesOfDay).toBeNull();
    expect(record.intervalHours).toBeNull();
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
    const updated = updateResult[0].serverRecord as { timesOfDay: string[]; version: number };
    expect(updated.timesOfDay).toEqual(["09:00:00"]);
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
    const deleted = deleteResult[0].serverRecord as { deletedAt: string | null };
    expect(deleted.deletedAt).not.toBeNull();
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
    const record = result[0].serverRecord as { status: string; takenAt: string };
    expect(record.status).toBe("taken");
    expect(new Date(record.takenAt).toISOString()).toBe(new Date(takenAt).toISOString());
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

  it("medicationPackage: create always lands status='unopened' regardless of what's (not) sent", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();

    const result = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationPackage",
        entityId: id,
        operation: "create",
        payload: {
          userMedicationId,
          source: "manual",
          gtin: null,
          batchNumber: "LOT123",
          serialNumber: null,
          expiryDate: "2027-01-01",
          receivedDate: "2026-01-01",
          initialQuantityValue: 30,
          quantityUnit: "tablet",
        },
      },
    ]);

    expect(result[0].result).toBe("applied");
    const record = result[0].serverRecord as { status: string; openedAt: string | null; version: number; batchNumber: string };
    expect(record.status).toBe("unopened");
    expect(record.openedAt).toBeNull();
    expect(record.version).toBe(1);
    expect(record.batchNumber).toBe("LOT123");
  });

  it("medicationPackage: create rejects an unknown userMedicationId (foreign key), isolated as a per-mutation failure", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();

    const results = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationPackage",
        entityId: randomUUID(),
        operation: "create",
        payload: {
          userMedicationId: randomUUID(),
          source: "manual",
          gtin: null,
          batchNumber: null,
          serialNumber: null,
          expiryDate: null,
          receivedDate: "2026-01-01",
          initialQuantityValue: 30,
          quantityUnit: "tablet",
        },
      },
    ]);

    expect(results[0].result).toBe("rejected");
  });

  it("medicationPackage: update transitions status to 'opened' with the correct baseVersion, and a stale baseVersion is a genuine conflict", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();
    const openedAt = new Date().toISOString();

    await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationPackage",
        entityId: id,
        operation: "create",
        payload: {
          userMedicationId,
          source: "manual",
          gtin: null,
          batchNumber: null,
          serialNumber: null,
          expiryDate: null,
          receivedDate: "2026-01-01",
          initialQuantityValue: 30,
          quantityUnit: "tablet",
        },
      },
    ]);

    const openResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "medicationPackage", entityId: id, operation: "update", baseVersion: 1, payload: { status: "opened", openedAt } },
    ]);
    expect(openResult[0].result).toBe("applied");
    const openedRecord = openResult[0].serverRecord as { status: string; openedAt: string; version: number };
    expect(openedRecord.status).toBe("opened");
    expect(new Date(openedRecord.openedAt).toISOString()).toBe(new Date(openedAt).toISOString());
    expect(openedRecord.version).toBe(2);

    // A second device, still holding the stale version 1, races in.
    const staleResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "medicationPackage", entityId: id, operation: "update", baseVersion: 1, payload: { status: "discarded" } },
    ]);
    expect(staleResult[0].result).toBe("conflict");
  });

  it("medicationPackage: delete is a soft-delete (tombstone), bumping version and setting deletedAt", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();

    await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationPackage",
        entityId: id,
        operation: "create",
        payload: {
          userMedicationId,
          source: "manual",
          gtin: null,
          batchNumber: null,
          serialNumber: null,
          expiryDate: null,
          receivedDate: "2026-01-01",
          initialQuantityValue: 30,
          quantityUnit: "tablet",
        },
      },
    ]);

    const deleteResult = await applyMutations({ profileId, accountId, db }, [
      { clientMutationId: randomUUID(), entityType: "medicationPackage", entityId: id, operation: "delete", baseVersion: 1, payload: {} },
    ]);
    expect(deleteResult[0].result).toBe("applied");
    const record = deleteResult[0].serverRecord as { deletedAt: string | null; version: number };
    expect(record.deletedAt).not.toBeNull();
    expect(record.version).toBe(2);
  });

  it("medicationInventoryTransaction: a 'refill' transaction (no doseEventId) is applied", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const id = randomUUID();

    const result = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationInventoryTransaction",
        entityId: id,
        operation: "create",
        payload: {
          userMedicationId,
          packageId: null,
          transactionType: "refill",
          quantityDelta: 30,
          quantityUnit: "tablet",
          doseEventId: null,
          occurredAt: new Date().toISOString(),
          source: "user",
          note: null,
        },
      },
    ]);

    expect(result[0].result).toBe("applied");
    const record = result[0].serverRecord as { transactionType: string; quantityDelta: string; doseEventId: string | null };
    expect(record.transactionType).toBe("refill");
    expect(Number(record.quantityDelta)).toBe(30);
    expect(record.doseEventId).toBeNull();
  });

  it("medicationInventoryTransaction: a 'dose_taken' transaction requires doseEventId (chk_dose_txn_has_event) and is rejected without one", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);

    const results = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationInventoryTransaction",
        entityId: randomUUID(),
        operation: "create",
        payload: {
          userMedicationId,
          packageId: null,
          transactionType: "dose_taken",
          quantityDelta: -1,
          quantityUnit: "tablet",
          doseEventId: null,
          occurredAt: new Date().toISOString(),
          source: "user",
          note: null,
        },
      },
    ]);

    expect(results[0].result).toBe("rejected");
  });

  it("medicationInventoryTransaction: a real 'dose_taken' transaction with a valid doseEventId is applied", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const doseEventId = randomUUID();

    await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "doseEvent",
        entityId: doseEventId,
        operation: "create",
        payload: { userMedicationId, scheduleId: null, scheduledAt: new Date().toISOString(), source: "manual_prn" },
      },
    ]);

    const result = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationInventoryTransaction",
        entityId: randomUUID(),
        operation: "create",
        payload: {
          userMedicationId,
          packageId: null,
          transactionType: "dose_taken",
          quantityDelta: -1,
          quantityUnit: "tablet",
          doseEventId,
          occurredAt: new Date().toISOString(),
          source: "user",
          note: null,
        },
      },
    ]);

    expect(result[0].result).toBe("applied");
    const record = result[0].serverRecord as { doseEventId: string; quantityDelta: string };
    expect(record.doseEventId).toBe(doseEventId);
    expect(Number(record.quantityDelta)).toBe(-1);
  });

  it("medicationInventoryTransaction: uq_inventory_txn_dose_taken_once — a second dose_taken row for the SAME doseEventId (different id) converges to the first row instead of double-consuming", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);
    const doseEventId = randomUUID();

    await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "doseEvent",
        entityId: doseEventId,
        operation: "create",
        payload: { userMedicationId, scheduleId: null, scheduledAt: new Date().toISOString(), source: "manual_prn" },
      },
    ]);

    const firstId = randomUUID();
    const firstResult = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationInventoryTransaction",
        entityId: firstId,
        operation: "create",
        payload: {
          userMedicationId,
          packageId: null,
          transactionType: "dose_taken",
          quantityDelta: -1,
          quantityUnit: "tablet",
          doseEventId,
          occurredAt: new Date().toISOString(),
          source: "user",
          note: null,
        },
      },
    ]);
    expect(firstResult[0].result).toBe("applied");

    // A retried mutation attempt for the SAME dose event, but with a
    // freshly-generated id/clientMutationId (simulating a client that
    // regenerated its outbox entry rather than a pure idempotent replay).
    const secondId = randomUUID();
    const secondResult = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationInventoryTransaction",
        entityId: secondId,
        operation: "create",
        payload: {
          userMedicationId,
          packageId: null,
          transactionType: "dose_taken",
          quantityDelta: -1,
          quantityUnit: "tablet",
          doseEventId,
          occurredAt: new Date().toISOString(),
          source: "user",
          note: null,
        },
      },
    ]);

    expect(secondResult[0].result).toBe("applied");
    const record = secondResult[0].serverRecord as { id: string };
    // Converges to the FIRST row's id -- the second attempt never actually inserted a competing row.
    expect(record.id).toBe(firstId);
  });

  it("medicationInventoryTransaction: update/delete are rejected — the ledger is append-only", async () => {
    const { accountId, profileId } = await seedAccountAndProfile();
    const userMedicationId = await seedUserMedication(profileId);

    const results = await applyMutations({ profileId, accountId, db }, [
      {
        clientMutationId: randomUUID(),
        entityType: "medicationInventoryTransaction",
        entityId: randomUUID(),
        operation: "update",
        payload: { userMedicationId, quantityDelta: -5 },
      },
    ]);

    expect(results[0].result).toBe("rejected");
  });
});
