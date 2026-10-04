/**
 * The one place a user's dose action (Taken / Taken late / Skip / Snooze /
 * Missed) is recorded — shared by Today's rows and Dose Detail, so both
 * screens go through exactly the same local transition, inventory
 * consumption and native-reminder refresh. Each transition is a local
 * Dexie write plus an outbox entry (`DexieDoseEventRepository.transition`),
 * so every action here works offline and syncs later.
 */
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { DexiePreferencesRepository } from "@/lib/db-client/user-preferences-repository";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { DexieMedicationPackageRepository } from "@/lib/db-client/medication-package-repository";
import { DexieInventoryTransactionRepository } from "@/lib/db-client/inventory-transaction-repository";
import { MedianMobilePlatform } from "@/lib/platform/median-mobile-platform";
import { syncNativeRemindersNow } from "@/lib/reminders/client/native-reminder-sync";
import { consumeInventoryForDoseTaken } from "@/lib/inventory/client/consume-dose";
import { recordMedicationInteraction } from "@/lib/medications/client/record-interaction";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import { newId } from "@/lib/domain/ids";
import { logger } from "@/lib/logging/logger";

/** A dose the user can still act on directly (Taken / Skip / Snooze / Missed). */
export function isDoseActionable(dose: Pick<DoseEventRecord, "status">): boolean {
  return dose.status === "scheduled" || dose.status === "reminded" || dose.status === "snoozed";
}

/**
 * Best-effort, fire-and-forget push to the native reminder layer (Phase
 * 11) right after a user-driven transition — the periodic scheduling tick
 * (`sync-manager.ts`) would eventually reconcile this too, but calling it
 * here avoids up to `SCHEDULING_TICK_INTERVAL_MS` of staleness where a
 * just-actioned dose's native alarm hasn't been cancelled/rescheduled yet.
 * Never awaited, and never throws into the caller: the repository
 * constructors run synchronously, as call arguments, before
 * `syncNativeRemindersNow`'s own async body starts.
 */
function pushNativeRemindersAfterTransition(profileId: string | null): void {
  if (!profileId) return;
  try {
    void syncNativeRemindersNow(profileId, {
      doseEvents: new DexieDoseEventRepository(),
      userMedications: new DexieUserMedicationRepository(),
      catalogCache: new DexieCatalogCacheRepository(),
      offlineIndex: new DexieOfflineIndexRepository(),
      platform: new MedianMobilePlatform(),
    }).catch((err) => logger.warn("doses.native_reminder_sync_failed", { message: err instanceof Error ? err.message : String(err) }));
  } catch (err) {
    logger.warn("doses.native_reminder_sync_failed", { message: err instanceof Error ? err.message : String(err) });
  }
}

async function transitionToTaken(doseId: string, profileId: string, status: "taken" | "taken_late"): Promise<DoseEventRecord> {
  const dose = await new DexieDoseEventRepository().transition(doseId, { status, takenAt: new Date().toISOString() }, newId());
  // Phase 9: decrement inventory (FIFO-attributed to the oldest open
  // package) the moment a dose is actually taken — best-effort, never
  // blocks or reverts the dose transition itself.
  await consumeInventoryForDoseTaken(dose, {
    medicationPackages: new DexieMedicationPackageRepository(),
    inventoryTransactions: new DexieInventoryTransactionRepository(),
  });
  recordMedicationInteraction(profileId, dose.userMedicationId, "marked_taken");
  return dose;
}

export async function recordDoseTaken(doseId: string, profileId: string): Promise<void> {
  await transitionToTaken(doseId, profileId, "taken");
  pushNativeRemindersAfterTransition(profileId);
}

/** The one recovery path out of `missed` — "I forgot to log it, but I did take it" (`isDoseEventTransitionAllowed`). A late dose is still a real dose, so it consumes inventory too. */
export async function recordDoseTakenLate(doseId: string, profileId: string): Promise<void> {
  await transitionToTaken(doseId, profileId, "taken_late");
  pushNativeRemindersAfterTransition(profileId);
}

export async function recordDoseSkipped(doseId: string, profileId: string): Promise<void> {
  await new DexieDoseEventRepository().transition(doseId, { status: "skipped" }, newId());
  pushNativeRemindersAfterTransition(profileId);
}

/** The user saying "I didn't take this one" — the same `missed` status the overdue sweep would eventually set, recorded now instead. */
export async function recordDoseMissed(doseId: string, profileId: string): Promise<void> {
  await new DexieDoseEventRepository().transition(doseId, { status: "missed" }, newId());
  pushNativeRemindersAfterTransition(profileId);
}

/** Non-terminal and freely repeatable: re-reminds after the user's own default snooze length. */
export async function snoozeDose(doseId: string, profileId: string, accountId: string): Promise<void> {
  const preferences = await new DexiePreferencesRepository().get(accountId);
  const snoozeMinutes = preferences?.reminderDefaultSnoozeMinutes ?? 10;
  const reminderAt = new Date(Date.now() + snoozeMinutes * 60_000).toISOString();
  await new DexieDoseEventRepository().transition(doseId, { status: "snoozed", reminderAt }, newId());
  pushNativeRemindersAfterTransition(profileId);
}

/** Bulk "mark all as taken" — the same per-dose path as `recordDoseTaken`, looped, with one native refresh at the end. */
export async function recordAllDosesTaken(doses: DoseEventRecord[], profileId: string): Promise<void> {
  for (const dose of doses.filter(isDoseActionable)) {
    await transitionToTaken(dose.id, profileId, "taken");
  }
  pushNativeRemindersAfterTransition(profileId);
}
