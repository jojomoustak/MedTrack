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
 *
 * [finishedDoseIds]: doses the user just finished (taken / skipped /
 * missed) — their reminders are cleared first, by id. The reconcile pass
 * only looks back 2 hours, and since 2026-10-14 the reminder notification
 * can't be swiped away: a dose marked later than that must still clear it.
 */
export function refreshNativeReminders(profileId: string | null, finishedDoseIds: readonly string[] = []): void {
  if (!profileId) return;
  try {
    const platform = new MedianMobilePlatform();
    const deps = {
      doseEvents: new DexieDoseEventRepository(),
      userMedications: new DexieUserMedicationRepository(),
      catalogCache: new DexieCatalogCacheRepository(),
      offlineIndex: new DexieOfflineIndexRepository(),
      platform,
    };
    void (async () => {
      if (platform.isAvailable()) {
        for (const doseId of finishedDoseIds) await platform.cancelRemindersForDoseEvent(doseId);
      }
      await syncNativeRemindersNow(profileId, deps);
    })().catch((err) => logger.warn("doses.native_reminder_sync_failed", { message: err instanceof Error ? err.message : String(err) }));
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
  refreshNativeReminders(profileId, [doseId]);
}

/** The one recovery path out of `missed` — "I forgot to log it, but I did take it" (`isDoseEventTransitionAllowed`). A late dose is still a real dose, so it consumes inventory too. */
export async function recordDoseTakenLate(doseId: string, profileId: string): Promise<void> {
  await transitionToTaken(doseId, profileId, "taken_late");
  refreshNativeReminders(profileId, [doseId]);
}

export async function recordDoseSkipped(doseId: string, profileId: string): Promise<void> {
  await new DexieDoseEventRepository().transition(doseId, { status: "skipped" }, newId());
  refreshNativeReminders(profileId, [doseId]);
}

/** The user saying "I didn't take this one" — the same `missed` status the overdue sweep would eventually set, recorded now instead. */
export async function recordDoseMissed(doseId: string, profileId: string): Promise<void> {
  await new DexieDoseEventRepository().transition(doseId, { status: "missed" }, newId());
  refreshNativeReminders(profileId, [doseId]);
}

/** Non-terminal and freely repeatable: re-reminds after the user's own default snooze length. */
export async function snoozeDose(doseId: string, profileId: string, accountId: string): Promise<void> {
  const preferences = await new DexiePreferencesRepository().get(accountId);
  const snoozeMinutes = preferences?.reminderDefaultSnoozeMinutes ?? 10;
  const reminderAt = new Date(Date.now() + snoozeMinutes * 60_000).toISOString();
  await new DexieDoseEventRepository().transition(doseId, { status: "snoozed", reminderAt }, newId());
  refreshNativeReminders(profileId);
}

/** Bulk "mark all as taken" — the same per-dose path as `recordDoseTaken`, looped, with one native refresh at the end. */
/** How early a dose counts as "due" for the bulk action — pills for the morning are often taken a little ahead of the set time. */
export const DUE_EARLY_WINDOW_MS = 60 * 60_000;

/**
 * Still waiting to be recorded, and its time has come (or comes within
 * `DUE_EARLY_WINDOW_MS`). Only these are covered by "mark all as taken".
 */
export function isDoseDue(dose: Pick<DoseEventRecord, "status" | "scheduledAt">, now: Date): boolean {
  return isDoseActionable(dose) && dose.scheduledAt !== null && new Date(dose.scheduledAt).getTime() <= now.getTime() + DUE_EARLY_WINDOW_MS;
}

/**
 * Records every DUE dose as taken — never one whose time is still ahead.
 * Real bug, found on the owner's phone (2026-10-11): this used to take
 * every pending dose of the day, so tapping it at 15:31 recorded the
 * 18:57–19:25 doses as taken hours early — false history, and their
 * reminders cancelled for doses not yet taken. Filtered here, not just in
 * the button, so no caller can do it again.
 */
export async function recordAllDosesTaken(doses: DoseEventRecord[], profileId: string, now: Date = new Date()): Promise<void> {
  const due = doses.filter((d) => isDoseDue(d, now));
  for (const dose of due) {
    await transitionToTaken(dose.id, profileId, "taken");
  }
  refreshNativeReminders(profileId, due.map((d) => d.id));
}
