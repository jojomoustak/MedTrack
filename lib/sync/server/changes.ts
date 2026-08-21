/**
 * Server-side cursor pull (`app/api/sync/changes` uses this) — Phase 1
 * §5 / Phase 2 §5.1: the device pulls from `sync_change_log` (one
 * monotonic cursor) instead of polling every entity table.
 */
import { and, asc, eq, gt, inArray } from "drizzle-orm";
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
