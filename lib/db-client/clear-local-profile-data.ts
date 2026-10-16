import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";

/**
 * Wipes every profile-scoped local table in one Dexie transaction — call
 * on explicit sign-out and account deletion, never on a mere "Clear
 * Cache" (CLAUDE.md rule 9's Clear Cache != Delete Account distinction;
 * this function is for the two actions that genuinely end this device's
 * relationship to the current profile, not casual cache clearing).
 *
 * Added alongside the offline-photo work (2026-08-29 audit) when it
 * surfaced that `clearCachedProfile()` (`lib/auth/client/use-current-
 * profile.ts`) only ever cleared the tiny localStorage identity pointer
 * — every Dexie table (medications, doses, schedules, purchase lists,
 * the outbox, and now the two photo tables) was left completely
 * untouched by sign-out or account deletion. On a shared device, that
 * meant the next person to open the app (even before any network round
 * trip) could see the previous user's locally-cached health data. This
 * is the single choke point fixing that for every table at once, rather
 * than each new offline feature needing to remember to wire itself into
 * sign-out separately.
 *
 * `medicationPackage` and `inventoryTransaction` (added in Dexie v8) were
 * missing from this list until 2026-10-04 — a shared device kept the
 * previous user's packages and stock ledger after sign-out. The pull
 * cursor (v9) is cleared too, so the next sign-in restores from 0.
 *
 * Deliberately does NOT touch `catalogProductCache`, `offlineIndexEntry`
 * or `offlineIndexMeta` — shared reference/catalog data, not this
 * profile's own, and actively useful to whoever uses this device next.
 * Box identifications (`learnedGtinMappingByProfile`) ARE this profile's
 * own and are cleared (2026-10-16; they used to be kept and shared with the
 * next person on the phone).
 *
 * IMPORTANT for callers: this unconditionally destroys anything still
 * queued in `outbox`/`photoOutboxEntry` that hasn't reached the server
 * yet. That's correct for account deletion (the account is gone
 * server-side either way, so there is nothing left to sync TO) but would
 * be a real, silent data-loss bug on plain sign-out if called
 * unconditionally there — check `hasPendingLocalWork()` first and skip
 * this call if it returns `true` (see `app/(app)/profile/page.tsx`'s
 * `handleSignOut`).
 */
export async function clearAllLocalProfileData(db: MedTrackingDexie = getClientDb()): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.outbox,
      db.userPreferences,
      db.purchaseList,
      db.purchaseListItem,
      db.userMedication,
      db.medicationSchedule,
      db.doseEvent,
      db.favorite,
      db.recentlyUsedEvent,
      db.unresolvedScan,
      db.medicationPhotoCache,
      db.photoThumbnail,
      db.photoOutboxEntry,
      db.learnedGtinMappingByProfile,
      db.medicationPackage,
      db.inventoryTransaction,
      db.syncPullCursor,
    ],
    async () => {
      await Promise.all([
        db.medicationPackage.clear(),
        db.inventoryTransaction.clear(),
        db.syncPullCursor.clear(),
        db.outbox.clear(),
        db.userPreferences.clear(),
        db.purchaseList.clear(),
        db.purchaseListItem.clear(),
        db.userMedication.clear(),
        db.medicationSchedule.clear(),
        db.doseEvent.clear(),
        db.favorite.clear(),
        db.recentlyUsedEvent.clear(),
        db.unresolvedScan.clear(),
        db.medicationPhotoCache.clear(),
        db.photoThumbnail.clear(),
        db.photoOutboxEntry.clear(),
        db.learnedGtinMappingByProfile.clear(),
      ]);
    },
  );
}

/**
 * True if anything is still queued to reach the server (the JSON outbox
 * or the photo outbox). A session cookie clears the instant
 * `authClient.signOut()` succeeds, and every sync call is
 * cookie-authenticated — so once signed out, whatever's still queued
 * here can NEVER be delivered under this session again. Callers should
 * use this to decide whether wiping local data on sign-out is actually
 * safe (nothing lost) or would silently discard real unsynced work.
 */
export async function hasPendingLocalWork(db: MedTrackingDexie = getClientDb()): Promise<boolean> {
  const [outboxCount, photoOutboxCount, unsentBoxes] = await Promise.all([
    db.outbox.count(),
    db.photoOutboxEntry.count(),
    // A box identification not uploaded yet is unsent work too (2026-10-16).
    db.learnedGtinMappingByProfile.filter((row) => row.syncedAt === null).count(),
  ]);
  return outboxCount > 0 || photoOutboxCount > 0 || unsentBoxes > 0;
}
