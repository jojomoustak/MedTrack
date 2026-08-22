/**
 * "What you lose" counts for the Delete Account confirmation screen
 * (Phase 3 §2.9 step 3: "concrete counts... pulled from the user's
 * actual data, not generic copy" — e.g. "7 medications, 214 recorded
 * doses, 3 lists"). Deliberately cheap: three `count(*)` queries against
 * indexed `profile_id` columns, nothing that scans/joins the full
 * deletion graph — this is a summary for a confirmation screen, not the
 * deletion job itself.
 */
import { count, eq } from "drizzle-orm";
import { getDb, type Db, type TestableDb } from "@/lib/db/client";
import { withProfileScope } from "@/lib/db/rls";
import * as schema from "@/lib/db/schema";

export interface DeletionSummaryCounts {
  medications: number;
  doseEvents: number;
  lists: number;
}

export async function getDeletionSummary(profileId: string, dbOverride?: Db | TestableDb): Promise<DeletionSummaryCounts> {
  const db = dbOverride ?? getDb();

  const [medicationRows, doseEventRows, listRows] = await withProfileScope(
    profileId,
    (scopedDb) =>
      [
        scopedDb
          .select({ value: count() })
          .from(schema.userMedication)
          .where(eq(schema.userMedication.profileId, profileId)),
        scopedDb.select({ value: count() }).from(schema.doseEvent).where(eq(schema.doseEvent.profileId, profileId)),
        scopedDb
          .select({ value: count() })
          .from(schema.purchaseList)
          .where(eq(schema.purchaseList.profileId, profileId)),
      ] as const,
    { db },
  );

  return {
    medications: Number(medicationRows[0]?.value ?? 0),
    doseEvents: Number(doseEventRows[0]?.value ?? 0),
    lists: Number(listRows[0]?.value ?? 0),
  };
}
