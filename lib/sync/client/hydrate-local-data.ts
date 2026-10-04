/**
 * One-shot "pull whatever this profile's server state already has and
 * merge it into the local Dexie cache" — reuses Phase 5/6's existing
 * `pullChanges`/`applyRemote` primitives directly, not new sync
 * architecture. Needed so a fresh page load (e.g. after a deploy, a
 * reload mid-demo, or a second device/reinstall) shows data that was
 * created in an earlier session/tab, not just whatever happens to already
 * be in this browser's IndexedDB. Best-effort: any failure (offline,
 * network) is swallowed — the local-first read the caller already does is
 * the source of truth for the offline case, per `designing-offline-sync`.
 *
 * Originally `hydrateUserMedicationsFromServer` (UserMedication only) —
 * broadened for Phase 10 after live-device testing (2026-08-30) found the
 * gap directly: a MedicationSchedule/DoseEvent created via the outbox on
 * one device synced to the server fine, but a `pullChanges` response
 * carrying that same schedule/dose (e.g. on a second device, or this
 * device after a reinstall) was silently dropped here — the loop below
 * only ever matched `change.entityType === "userMedication"`, so anything
 * else in the pulled batch was read and discarded. `changes.ts` already
 * hydrates a full record for medicationSchedule/doseEvent; this was the
 * one place that never consumed it.
 *
 * Found the identical gap again for `purchaseList` (2026-09-13, while
 * building `purchaseListItem`) — `purchaseList` had a real repository and
 * a working `apply-result.ts`/`sync-manager.ts` wiring since Phase 5, but
 * was never added here, so a second device (or a reinstall) would never
 * actually see an existing account's purchase lists. Both `purchaseList`
 * and the new `purchaseListItem` are wired in below.
 *
 * Resumable (2026-10-04): this used to restart from cursor 0 on every call
 * and stop after 10 pages of 100 changes. Every dose created, taken or
 * skipped adds to the change feed, so a regular user passes 1,000 entries
 * within months — after which a new device or reinstall would restore
 * only the OLDEST 1,000 changes and silently miss their most recent
 * medications and doses, and every visit to Today/Medications re-pulled
 * the whole prefix. Given a `profileId`, it now resumes from a persisted
 * per-profile cursor, saves progress after each applied page, and keeps
 * going until caught up (a generous per-call page bound only spreads a
 * huge first restore across calls; it never drops data). Re-applying a
 * page is harmless — `applyRemote` is idempotent, which the old
 * replay-from-0 behaviour already relied on.
 */
import { pullChanges } from "@/lib/sync/client/api";
import { notifyLocalDataHydrated } from "@/lib/sync/client/local-data-signal";
import { DexieSyncPullCursorRepository } from "@/lib/db-client/sync-pull-cursor-repository";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { DexieMedicationPackageRepository } from "@/lib/db-client/medication-package-repository";
import { DexieInventoryTransactionRepository } from "@/lib/db-client/inventory-transaction-repository";
import { DexieFavoriteRepository } from "@/lib/db-client/favorite-repository";
import { DexieRecentlyUsedEventRepository } from "@/lib/db-client/recently-used-event-repository";
import { DexiePurchaseListRepository } from "@/lib/db-client/purchase-list-repository";
import { DexiePurchaseListItemRepository } from "@/lib/db-client/purchase-list-item-repository";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import type { MedicationPackageRecord } from "@/lib/domain/medication-package";
import type { InventoryTransactionRecord } from "@/lib/domain/inventory-transaction";
import type { FavoriteRecord } from "@/lib/domain/favorite";
import type { RecentlyUsedEventRecord } from "@/lib/domain/recently-used-event";
import type { PurchaseListItemRecord, PurchaseListRecord } from "@/lib/domain/entities";
import { getCachedProfileId } from "@/lib/auth/client/use-current-profile";
import { logger } from "@/lib/logging/logger";

export interface HydrateLocalDataDeps {
  userMedication?: DexieUserMedicationRepository;
  medicationSchedule?: DexieMedicationScheduleRepository;
  doseEvent?: DexieDoseEventRepository;
  medicationPackage?: DexieMedicationPackageRepository;
  inventoryTransaction?: DexieInventoryTransactionRepository;
  favorite?: DexieFavoriteRepository;
  recentlyUsedEvent?: DexieRecentlyUsedEventRepository;
  purchaseList?: DexiePurchaseListRepository;
  purchaseListItem?: DexiePurchaseListItemRepository;
  /** Injectable for tests — defaults to the real `pullChanges` (which calls the network). */
  pullChanges?: typeof pullChanges;
  /**
   * The signed-in profile. When given, the pull resumes from (and saves to)
   * that profile's persisted cursor. Without it, the pull starts from 0 and
   * nothing is persisted.
   */
  profileId?: string;
  cursorStore?: DexieSyncPullCursorRepository;
  /** Who is signed in right now — injectable for tests; defaults to `getCachedProfileId`. */
  currentProfileId?: () => string | null;
}

/** Upper bound on pages per call — only spreads a very large first restore across calls; progress is saved per page, so nothing is skipped. */
const MAX_PAGES_PER_CALL = 100;

const inFlight = new Map<string, Promise<void>>();

export function hydrateLocalDataFromServer(deps: HydrateLocalDataDeps = {}): Promise<void> {
  // Several views mount together and each asks for a catch-up; share one
  // pass per profile instead of racing duplicate pulls of the same pages.
  const key = deps.profileId;
  if (!key) return runHydration(deps);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const run = runHydration(deps).finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

async function runHydration(deps: HydrateLocalDataDeps): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const userMedication = deps.userMedication ?? new DexieUserMedicationRepository();
  const medicationSchedule = deps.medicationSchedule ?? new DexieMedicationScheduleRepository();
  const doseEvent = deps.doseEvent ?? new DexieDoseEventRepository();
  const medicationPackage = deps.medicationPackage ?? new DexieMedicationPackageRepository();
  const inventoryTransaction = deps.inventoryTransaction ?? new DexieInventoryTransactionRepository();
  const favorite = deps.favorite ?? new DexieFavoriteRepository();
  const recentlyUsedEvent = deps.recentlyUsedEvent ?? new DexieRecentlyUsedEventRepository();
  const purchaseList = deps.purchaseList ?? new DexiePurchaseListRepository();
  const purchaseListItem = deps.purchaseListItem ?? new DexiePurchaseListItemRepository();
  const pull = deps.pullChanges ?? pullChanges;
  const profileId = deps.profileId;
  const cursorStore = profileId ? (deps.cursorStore ?? new DexieSyncPullCursorRepository()) : null;
  const currentProfileId = deps.currentProfileId ?? getCachedProfileId;
  let applied = 0;

  try {
    let cursor = cursorStore && profileId ? await cursorStore.get(profileId) : 0;
    for (let page = 0; page < MAX_PAGES_PER_CALL; page++) {
      // A pass can outlive the session it started under (sign-out, or
      // another user signing in on this device mid-restore). Stop before
      // fetching, and again before storing, rather than file one user's
      // records — or cursor — under another's profile.
      if (profileId && currentProfileId() !== profileId) return stopForProfileSwitch(applied);
      const response = await pull(cursor);
      if (profileId && ((response.profileId !== undefined && response.profileId !== profileId) || currentProfileId() !== profileId)) {
        return stopForProfileSwitch(applied);
      }
      for (const change of response.changes) {
        if (!change.record) continue;
        if (change.entityType === "userMedication") {
          await userMedication.applyRemote(change.record as unknown as UserMedicationRecord);
        } else if (change.entityType === "medicationSchedule") {
          await medicationSchedule.applyRemote(change.record as unknown as MedicationScheduleRecord);
        } else if (change.entityType === "doseEvent") {
          await doseEvent.applyRemote(change.record as unknown as DoseEventRecord);
        } else if (change.entityType === "medicationPackage") {
          await medicationPackage.applyRemote(change.record as unknown as MedicationPackageRecord);
        } else if (change.entityType === "medicationInventoryTransaction") {
          await inventoryTransaction.applyRemote(change.record as unknown as InventoryTransactionRecord);
        } else if (change.entityType === "favorite") {
          await favorite.applyRemote(change.record as unknown as FavoriteRecord);
        } else if (change.entityType === "recentlyUsedEvent") {
          await recentlyUsedEvent.applyRemote(change.record as unknown as RecentlyUsedEventRecord);
        } else if (change.entityType === "purchaseList") {
          await purchaseList.applyRemote(change.record as unknown as PurchaseListRecord);
        } else if (change.entityType === "purchaseListItem") {
          await purchaseListItem.applyRemote(change.record as unknown as PurchaseListItemRecord);
        }
      }
      applied += response.changes.length;
      if (response.nextCursor === cursor || response.changes.length === 0) break;
      cursor = response.nextCursor;
      // Saved only after the whole page is applied: an interrupted pass
      // resumes at this page, never past records it didn't store.
      if (cursorStore && profileId) await cursorStore.set(profileId, cursor);
    }
  } catch (err) {
    logger.warn("sync.hydrate.local_data_failed", { message: (err as Error).message });
  }

  if (applied > 0) notifyLocalDataHydrated();
}

function stopForProfileSwitch(applied: number): void {
  logger.warn("sync.hydrate.profile_switched", {});
  if (applied > 0) notifyLocalDataHydrated();
}
