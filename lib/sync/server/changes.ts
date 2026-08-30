/**
 * Server-side cursor pull (`app/api/sync/changes` uses this) — Phase 1
 * §5 / Phase 2 §5.1: the device pulls from `sync_change_log` (one
 * monotonic cursor) instead of polling every entity table.
 */
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { withProfileScope } from "@/lib/db/rls";
import * as schema from "@/lib/db/schema";
import type { Db, TestableDb } from "@/lib/db/client";
import type { SyncChangeEntry, SyncChangesResponseBody } from "@/lib/sync/protocol";

export async function pullChanges(
  profileId: string,
  accountId: string,
  cursor: number,
  limit: number,
  /** Test-only injection point — production callers omit this and get the default `getDb()`. */
  db?: Db | TestableDb,
): Promise<SyncChangesResponseBody> {
  const [logRows] = await withProfileScope(
    profileId,
    (db) => [
      db
        .select()
        .from(schema.syncChangeLog)
        .where(and(eq(schema.syncChangeLog.profileId, profileId), gt(schema.syncChangeLog.id, BigInt(cursor))))
        .orderBy(asc(schema.syncChangeLog.id))
        .limit(limit),
    ],
    { accountId, db },
  );

  if (logRows.length === 0) {
    return { changes: [], nextCursor: cursor };
  }

  const purchaseListIds = logRows.filter((r) => r.entityType === "purchaseList").map((r) => r.entityId);
  const purchaseListRecords =
    purchaseListIds.length > 0
      ? (
          await withProfileScope(
            profileId,
            (db) => [db.select().from(schema.purchaseList).where(inArray(schema.purchaseList.id, purchaseListIds))],
            { db },
          )
        )[0]
      : [];
  const purchaseListById = new Map(purchaseListRecords.map((r) => [r.id, r]));

  const userMedicationIds = logRows.filter((r) => r.entityType === "userMedication").map((r) => r.entityId);
  const userMedicationRecords =
    userMedicationIds.length > 0
      ? (
          await withProfileScope(
            profileId,
            (db) => [db.select().from(schema.userMedication).where(inArray(schema.userMedication.id, userMedicationIds))],
            { db },
          )
        )[0]
      : [];
  const userMedicationById = new Map(userMedicationRecords.map((r) => [r.id, r]));

  // medicationSchedule: hydrated record needs the same flattened
  // wall-clock/elapsed shape the mutation payload/response uses (see
  // lib/sync/server/mutations.ts's applyMedicationScheduleMutation doc).
  // Builds the id list as `sql.join(...)` rather than interpolating a
  // bare JS array into `= ANY(${array}::uuid[])` -- that exact pattern
  // was found to not parameterize correctly against the `pg` driver
  // during this project's own stabilization pass (postgres-provider
  // integration test cleanup code); `sql.join` produces individually
  // bound parameters instead of relying on a driver's native array-type
  // serialization, which works correctly against both the Neon HTTP
  // driver (production) and `pg` (integration tests, `TestableDb`).
  const scheduleIds = logRows.filter((r) => r.entityType === "medicationSchedule").map((r) => r.entityId);
  const scheduleRecords =
    scheduleIds.length > 0
      ? (
          await withProfileScope(
            profileId,
            (db) => [
              db.execute(sql`
                SELECT s.*, wc.times_of_day, wc.weekdays_mask, el.interval_hours, el.anchor_at
                FROM medication_schedule s
                LEFT JOIN medication_schedule_wall_clock wc ON wc.schedule_id = s.id
                LEFT JOIN medication_schedule_elapsed el ON el.schedule_id = s.id
                WHERE s.id IN (${sql.join(
                  scheduleIds.map((id) => sql`${id}::uuid`),
                  sql`, `,
                )})
              `),
            ],
            { db },
          )
        )[0]
      : undefined;
  const scheduleRows = (scheduleRecords as { rows?: Record<string, unknown>[] } | undefined)?.rows ?? [];
  const scheduleById = new Map(scheduleRows.map((r) => [r.id as string, r]));

  const doseEventIds = logRows.filter((r) => r.entityType === "doseEvent").map((r) => r.entityId);
  const doseEventRecords =
    doseEventIds.length > 0
      ? (await withProfileScope(profileId, (db) => [db.select().from(schema.doseEvent).where(inArray(schema.doseEvent.id, doseEventIds))], { db }))[0]
      : [];
  const doseEventById = new Map(doseEventRecords.map((r) => [r.id, r]));

  const userPreferencesRecords =
    logRows.some((r) => r.entityType === "userPreferences")
      ? (
          await withProfileScope(profileId, (db) => [db.select().from(schema.userPreferences).where(eq(schema.userPreferences.accountId, accountId))], {
            accountId,
            db,
          })
        )[0]
      : [];
  const preferencesRecord = userPreferencesRecords[0];

  const changes: SyncChangeEntry[] = logRows.map((row) => {
    let record: Record<string, unknown> | undefined;
    if (row.entityType === "purchaseList") {
      record = purchaseListById.get(row.entityId) as Record<string, unknown> | undefined;
    } else if (row.entityType === "userMedication") {
      record = userMedicationById.get(row.entityId) as Record<string, unknown> | undefined;
    } else if (row.entityType === "userPreferences") {
      record = preferencesRecord as Record<string, unknown> | undefined;
    } else if (row.entityType === "medicationSchedule") {
      record = scheduleById.get(row.entityId);
    } else if (row.entityType === "doseEvent") {
      record = doseEventById.get(row.entityId) as Record<string, unknown> | undefined;
    }
    return {
      id: Number(row.id),
      entityType: row.entityType,
      entityId: row.entityId,
      operation: row.operation as SyncChangeEntry["operation"],
      serverVersion: row.serverVersion,
      occurredAt: row.occurredAt,
      record,
    };
  });

  return { changes, nextCursor: changes[changes.length - 1]?.id ?? cursor };
}
