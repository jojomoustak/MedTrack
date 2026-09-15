/**
 * GDPR Art. 15/20 (right of access / data portability) — a real gap found
 * by the security-privacy-reviewer audit (Phase 15 Hardening, 2026-09-15):
 * `deleteAccount` (this same directory) had a thorough, reviewed export of
 * every profile-owned table, but nothing let a user actually GET that data
 * back out first. This mirrors `deleteAccount`'s own table enumeration
 * (kept in sync with it deliberately — re-check both whenever a table
 * gains a `profile_id`/`account_id` FK) rather than re-deriving it, since
 * that list has already been cross-checked against `lib/db/schema.ts`
 * twice by a real security review.
 *
 * Deliberately EXCLUDED, unlike the deletion workflow: `account_session`,
 * `account_credential`, `account_verification` — these are authentication
 * security state (session tokens, password hashes, OAuth provider tokens),
 * not "the user's data" in the Art. 20 portability sense, and returning
 * them would hand the requester security material rather than personal
 * data. `medication_catalog_product` and AUTHORITATIVE `medication_
 * identifier` rows are catalog-owned reference data with no profile
 * ownership, same reasoning `deleteAccount` uses to leave them untouched.
 *
 * Uses `.select()` (all columns, correct camelCase keys) rather than a
 * hand-picked column list — Art. 20 asks for the data IN FULL, and a
 * hand-picked list silently goes stale the next time a column is added
 * (the exact "matches schema.ts at the time this file was FIRST written,
 * not now" bug class the deletion workflow's own header calls out about a
 * different table).
 */
import { eq, sql } from "drizzle-orm";
import { getDb, type Db, type TestableDb } from "@/lib/db/client";
import { withProfileScope } from "@/lib/db/rls";
import * as schema from "@/lib/db/schema";

export interface AccountDataExport {
  exportedAt: string;
  account: unknown;
  profile: unknown;
  userPreferences: unknown[];
  userMedications: unknown[];
  medicationSchedules: unknown[];
  medicationScheduleWallClock: unknown[];
  medicationScheduleElapsed: unknown[];
  doseEvents: unknown[];
  medicationPackages: unknown[];
  inventoryTransactions: unknown[];
  favorites: unknown[];
  recentlyUsedEvents: unknown[];
  purchaseLists: unknown[];
  purchaseListItems: unknown[];
  /** Only USER_CONFIRMED/VERIFIED_PHYSICAL_OBSERVATION/COMMUNITY_CONFIRMED rows this profile confirmed — never the shared AUTHORITATIVE catalog mappings. */
  confirmedMedicationIdentifiers: unknown[];
}

export async function exportAccountData(
  accountId: string,
  profileId: string,
  dbOverride?: Db | TestableDb,
): Promise<AccountDataExport> {
  const db = dbOverride ?? getDb();

  const [
    accountRows,
    profileRows,
    userPreferencesRows,
    userMedicationRows,
    medicationScheduleRows,
    wallClockRows,
    elapsedRows,
    doseEventRows,
    medicationPackageRows,
    inventoryTransactionRows,
    favoriteRows,
    recentlyUsedEventRows,
    purchaseListRows,
    purchaseListItemRows,
    medicationIdentifierRows,
  ] = await withProfileScope(
    profileId,
    (scopedDb) =>
      [
        scopedDb.select().from(schema.account).where(eq(schema.account.id, accountId)),
        scopedDb.select().from(schema.profile).where(eq(schema.profile.id, profileId)),
        scopedDb.select().from(schema.userPreferences).where(eq(schema.userPreferences.accountId, accountId)),
        scopedDb.select().from(schema.userMedication).where(eq(schema.userMedication.profileId, profileId)),
        scopedDb.select().from(schema.medicationSchedule).where(eq(schema.medicationSchedule.profileId, profileId)),
        // No profile_id column on the schedule subtype tables (Phase 2
        // §2.6) — scoped via the same schedule_id-subquery shape the RLS
        // policy itself uses (lib/db/migrations/0001_..., "SUBTYPE-TABLE
        // NOTE"), not a new pattern invented here.
        scopedDb
          .select()
          .from(schema.medicationScheduleWallClock)
          .where(
            sql`${schema.medicationScheduleWallClock.scheduleId} IN (SELECT "id" FROM "medication_schedule" WHERE "profile_id" = ${profileId})`,
          ),
        scopedDb
          .select()
          .from(schema.medicationScheduleElapsed)
          .where(
            sql`${schema.medicationScheduleElapsed.scheduleId} IN (SELECT "id" FROM "medication_schedule" WHERE "profile_id" = ${profileId})`,
          ),
        scopedDb.select().from(schema.doseEvent).where(eq(schema.doseEvent.profileId, profileId)),
        scopedDb.select().from(schema.medicationPackage).where(eq(schema.medicationPackage.profileId, profileId)),
        scopedDb
          .select()
          .from(schema.medicationInventoryTransaction)
          .where(eq(schema.medicationInventoryTransaction.profileId, profileId)),
        scopedDb.select().from(schema.favorite).where(eq(schema.favorite.profileId, profileId)),
        scopedDb.select().from(schema.recentlyUsedEvent).where(eq(schema.recentlyUsedEvent.profileId, profileId)),
        scopedDb.select().from(schema.purchaseList).where(eq(schema.purchaseList.profileId, profileId)),
        scopedDb.select().from(schema.purchaseListItem).where(eq(schema.purchaseListItem.profileId, profileId)),
        scopedDb.select().from(schema.medicationIdentifier).where(eq(schema.medicationIdentifier.profileId, profileId)),
      ] as const,
    { accountId, db },
  );

  return {
    exportedAt: new Date().toISOString(),
    account: accountRows[0] ?? null,
    profile: profileRows[0] ?? null,
    userPreferences: userPreferencesRows,
    userMedications: userMedicationRows,
    medicationSchedules: medicationScheduleRows,
    medicationScheduleWallClock: wallClockRows,
    medicationScheduleElapsed: elapsedRows,
    doseEvents: doseEventRows,
    medicationPackages: medicationPackageRows,
    inventoryTransactions: inventoryTransactionRows,
    favorites: favoriteRows,
    recentlyUsedEvents: recentlyUsedEventRows,
    purchaseLists: purchaseListRows,
    purchaseListItems: purchaseListItemRows,
    confirmedMedicationIdentifiers: medicationIdentifierRows,
  };
}
