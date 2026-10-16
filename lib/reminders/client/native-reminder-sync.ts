/**
 * Pushes near-term dose reminders to the native Android layer (Phase 11,
 * `scheduling-android-reminders` skill, ADR-009/ADR-011) — the web/Dexie
 * side of `Medication schedule → generate future DoseEvents → sync
 * near-term reminders to Android → Room → AlarmManager → notification`.
 * No-op (never calls the bridge) when `platform.isAvailable()` is false —
 * a plain browser or a preview deploy never triggers a `median://`
 * navigation.
 *
 * Deliberately a single reconcile pass, not an incremental diff: every
 * call re-derives "what SHOULD be scheduled right now" from one range
 * query over `doseEvent` and pushes the full result — `upsertReminder`
 * is idempotent (native replaces any existing `AlarmManager` entry for
 * the same id rather than stacking a second one), and a terminal dose
 * event found in the same range gets an explicit `cancelRemindersForDoseEvent`.
 * This makes every call self-healing (safe after a missed tick, a killed
 * app, or an out-of-order transition) without this module needing to
 * track "what did I already push" anywhere.
 */
import type { DoseEventRepository, UserMedicationRepository, CatalogCacheRepository, OfflineIndexRepository } from "@/lib/domain/repositories";
import { isTerminalDoseEventStatus } from "@/lib/domain/dose-event";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import { isTimestampBefore } from "@/lib/domain/timestamp";
import type { MobilePlatform } from "@/lib/platform/mobile-platform";
import { doseQuantityLabel } from "@/lib/medications/dose-quantity-label";
import { resolveMedicationDisplayName } from "@/lib/medications/client/use-display-names";
import { logger } from "@/lib/logging/logger";
import { GENERATION_HORIZON_MS } from "@/lib/scheduling/client/dose-event-generator";

/** How far back to look for a just-turned-terminal dose event to cancel — generous slack over the 45-minute scheduling-tick cadence (`sync-manager.ts`) so a missed tick still self-heals on the next one. */
const RECONCILE_LOOKBACK_MS = 2 * 3_600_000;

/**
 * How far ahead to push reminders: the whole dose-event generation horizon
 * (72 h, `dose-event-generator.ts`). Native alarms are the only thing that
 * fires while the app is closed, and new ones are only armed while it's
 * open — so this is how long reminders keep coming without the user
 * opening the app.
 *
 * It was 36 h, to keep the per-pass bridge traffic down. Found live
 * (2026-10-11, the owner's Redmi Note 8): the app wasn't opened from Friday
 * evening to Sunday afternoon, MIUI had killed it in the background, and
 * the armed reminders simply ran out — Sunday's 14:01 doses got no
 * notification at all. Doubling the window roughly doubles the calls per
 * pass (tens, not hundreds), a fair price for reminder reliability
 * (CLAUDE.md's priority order).
 */
const REMINDER_PUSH_HORIZON_MS = GENERATION_HORIZON_MS;

export interface NativeReminderSyncDeps {
  doseEvents: Pick<DoseEventRepository, "listForProfileInRange">;
  userMedications: Pick<UserMedicationRepository, "get">;
  catalogCache: Pick<CatalogCacheRepository, "get">;
  offlineIndex: Pick<OfflineIndexRepository, "getById">;
  platform: Pick<MobilePlatform, "isAvailable" | "upsertReminder" | "cancelRemindersForDoseEvent">;
  now?: () => Date;
  /** Whether `profileId` is still signed in: a pass that started just before signing out stops arming at once (`cancelAllNativeReminders`). */
  isStillSignedIn?: () => boolean;
}

/**
 * The notification's second line, worded like Today's rows: "1 δισκίο",
 * "2 δισκία". It used to print the stored decimal and the picker label —
 * "1.000 Δισκίο", as the owner saw on their lock screen (2026-10-14).
 */
function doseText(dose: DoseEventRecord): string {
  return doseQuantityLabel(dose.quantityValue, dose.quantityUnit) ?? "Υπενθύμιση δόσης";
}

/** Longest signing out waits for the phone to drop its reminders before going on anyway. */
const CANCEL_ALL_WAIT_MS = 3000;

/**
 * Every reminder on this phone stops: armed alarms, stored reminders (so
 * nothing re-arms after a reboot), the ringing and the notification. For
 * signing out and deleting the account only, never for an expired session:
 * someone whose session lapsed still takes their medicines, and their
 * reminders must keep coming until they sign in again (safety first,
 * CLAUDE.md). A no-op outside the native app; never throws, and never holds
 * signing out up for more than a few seconds.
 */
export async function cancelAllNativeReminders(platform: Pick<MobilePlatform, "isAvailable" | "cancelAllReminders">): Promise<void> {
  if (!platform.isAvailable()) return;
  try {
    const result = await Promise.race([
      platform.cancelAllReminders(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CANCEL_ALL_WAIT_MS)),
    ]);
    if (result === null) logger.warn("reminders.cancel_all.timed_out", {});
    else if (result.status !== "ok") logger.warn("reminders.cancel_all.failed", { errorCode: result.errorCode });
  } catch (err) {
    logger.warn("reminders.cancel_all.failed", { message: err instanceof Error ? err.message : String(err) });
  }
}

export async function syncNativeRemindersNow(profileId: string, deps: NativeReminderSyncDeps): Promise<void> {
  if (!deps.platform.isAvailable()) return;

  const now = deps.now?.() ?? new Date();
  const fromIso = new Date(now.getTime() - RECONCILE_LOOKBACK_MS).toISOString();
  const toIso = new Date(now.getTime() + REMINDER_PUSH_HORIZON_MS).toISOString();

  const doseEvents = await deps.doseEvents.listForProfileInRange(profileId, fromIso, toIso);
  const medicationNameCache = new Map<string, string>();

  for (const dose of doseEvents) {
    if (deps.isStillSignedIn && !deps.isStillSignedIn()) return;
    try {
      if (isTerminalDoseEventStatus(dose.status)) {
        await deps.platform.cancelRemindersForDoseEvent(dose.id);
        continue;
      }
      if (dose.reminderAt === null || dose.scheduleId === null) continue;
      // Real bug found live (2026-09-13): a dose that already fired
      // natively stays non-terminal on the WEB side for up to an hour
      // (`DEFAULT_MISSED_GRACE_MINUTES`, `sweepMissedDoseEvents`) while the
      // user hasn't yet tapped Taken/Skip — every reconcile pass in that
      // window used to unconditionally re-`upsertReminder` it with its
      // now-PAST `reminderAt`. Native's `AlarmManager.setExactAndAllow-
      // WhileIdle` fires almost immediately for a past trigger time, so
      // the SAME reminder re-fired (and re-posted into the same
      // notification id) every time the app reconciled — reopening the
      // app, a scheduling tick, anything. Skipping an already-past
      // `reminderAt` here leaves an already-fired alarm alone entirely
      // (nothing to re-arm) and simply never arms one for an overdue dose
      // that native hasn't fired yet either, which is correct: the
      // `RECONCILE_LOOKBACK_MS` window above exists for the CANCEL branch
      // (a just-turned-terminal dose still needs its stale alarm torn
      // down), not for arming new ones with a trigger time that's already
      // gone.
      if (isTimestampBefore(dose.reminderAt, now.toISOString())) continue;

      let medicationLabel = medicationNameCache.get(dose.userMedicationId);
      if (medicationLabel === undefined) {
        const med = await deps.userMedications.get(dose.userMedicationId);
        medicationLabel = (med && (await resolveMedicationDisplayName(med, deps.catalogCache, deps.offlineIndex))) ?? "Φάρμακο από κατάλογο";
        medicationNameCache.set(dose.userMedicationId, medicationLabel);
      }

      await deps.platform.upsertReminder({
        doseEventId: dose.id,
        scheduleId: dose.scheduleId,
        triggerAtEpochMs: new Date(dose.reminderAt).getTime(),
        medicationLabel,
        doseText: doseText(dose),
      });
    } catch (err) {
      // Best-effort, per dose event — one bad medication-name lookup or
      // one bridge call timing out must not stop the rest of this pass
      // from reconciling (same "isolate one failure" reasoning as
      // `applyMutations` on the sync side).
      logger.warn("reminders.native_sync.item_failed", { doseEventId: dose.id, message: err instanceof Error ? err.message : String(err) });
    }
  }
}
