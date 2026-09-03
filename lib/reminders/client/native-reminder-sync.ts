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
import type { MobilePlatform } from "@/lib/platform/mobile-platform";
import { FORM_LABELS } from "@/components/medications/DetailsStep";
import { resolveMedicationDisplayName } from "@/lib/medications/client/use-display-names";
import type { MedicationForm } from "@/lib/domain/user-medication";
import { logger } from "@/lib/logging/logger";

/** How far back to look for a just-turned-terminal dose event to cancel — generous slack over the 45-minute scheduling-tick cadence (`sync-manager.ts`) so a missed tick still self-heals on the next one. */
const RECONCILE_LOOKBACK_MS = 2 * 3_600_000;

/** How far ahead to push reminders — deliberately tighter than the 72h dose-event GENERATION horizon (`dose-event-generator.ts`): a native alarm this far out has little value and keeps bridge-call volume down, since every tick re-pushes the whole window. */
const REMINDER_PUSH_HORIZON_MS = 36 * 3_600_000;

export interface NativeReminderSyncDeps {
  doseEvents: Pick<DoseEventRepository, "listForProfileInRange">;
  userMedications: Pick<UserMedicationRepository, "get">;
  catalogCache: Pick<CatalogCacheRepository, "get">;
  offlineIndex: Pick<OfflineIndexRepository, "getById">;
  platform: Pick<MobilePlatform, "isAvailable" | "upsertReminder" | "cancelRemindersForDoseEvent">;
  now?: () => Date;
}

function doseText(dose: DoseEventRecord): string {
  if (!dose.quantityValue || !dose.quantityUnit) return "Υπενθύμιση δόσης";
  const label = FORM_LABELS[dose.quantityUnit as MedicationForm] ?? dose.quantityUnit;
  return `${dose.quantityValue} ${label}`;
}

export async function syncNativeRemindersNow(profileId: string, deps: NativeReminderSyncDeps): Promise<void> {
  if (!deps.platform.isAvailable()) return;

  const now = deps.now?.() ?? new Date();
  const fromIso = new Date(now.getTime() - RECONCILE_LOOKBACK_MS).toISOString();
  const toIso = new Date(now.getTime() + REMINDER_PUSH_HORIZON_MS).toISOString();

  const doseEvents = await deps.doseEvents.listForProfileInRange(profileId, fromIso, toIso);
  const medicationNameCache = new Map<string, string>();

  for (const dose of doseEvents) {
    try {
      if (isTerminalDoseEventStatus(dose.status)) {
        await deps.platform.cancelRemindersForDoseEvent(dose.id);
        continue;
      }
      if (dose.reminderAt === null || dose.scheduleId === null) continue;

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
