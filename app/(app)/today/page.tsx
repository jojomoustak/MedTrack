"use client";

import Link from "next/link";
import { useProfileId, useAccountId } from "@/components/shell/CurrentProfileContext";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useTodayDoseEvents, allTodayDosesResolved } from "@/components/today/use-today-dose-events";
import { DoseCard } from "@/components/today/DoseCard";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { DexiePreferencesRepository } from "@/lib/db-client/user-preferences-repository";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { MedianMobilePlatform } from "@/lib/platform/median-mobile-platform";
import { syncNativeRemindersNow } from "@/lib/reminders/client/native-reminder-sync";
import { newId } from "@/lib/domain/ids";
import { logger } from "@/lib/logging/logger";

/**
 * Best-effort, fire-and-forget push to the native reminder layer (Phase
 * 11) right after a user-driven Taken/Skip/Snooze transition — the
 * periodic scheduling tick (`sync-manager.ts`) would eventually reconcile
 * this too, but calling it here as well avoids up to
 * `SCHEDULING_TICK_INTERVAL_MS` of staleness where a just-actioned dose's
 * native alarm hasn't been cancelled/rescheduled yet. Never awaited by a
 * caller — this must not block the optimistic-undo-window UI on a bridge
 * round trip, and (the try/catch below) must never throw INTO a caller
 * either: the repository constructors run synchronously, as call
 * arguments, before `syncNativeRemindersNow`'s own async body even
 * starts, so a synchronous throw there could otherwise skip the
 * `refresh()` call right after this in every handler below, leaving the
 * UI stale even though the actual transition already committed fine.
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
    }).catch((err) => logger.warn("today.native_reminder_sync_failed", { message: err instanceof Error ? err.message : String(err) }));
  } catch (err) {
    logger.warn("today.native_reminder_sync_failed", { message: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Today (Phase 3 §2.2) — the daily adherence loop's home screen. Real
 * dose data now that Phase 10's schedule/dose-event domain exists (was a
 * permanent placeholder before, per this file's own prior history).
 */
export default function TodayPage() {
  const profileId = useProfileId();
  const accountId = useAccountId();
  const { status: medsStatus, medications } = useMedicationsList(profileId);
  const names = useDisplayNames(medications);
  const { status: dosesStatus, todayDoses, needsAttention, refresh } = useTodayDoseEvents(profileId);

  async function handleTaken(doseId: string) {
    const repo = new DexieDoseEventRepository();
    await repo.transition(doseId, { status: "taken", takenAt: new Date().toISOString() }, newId());
    pushNativeRemindersAfterTransition(profileId);
    refresh();
  }

  async function handleSkipped(doseId: string) {
    const repo = new DexieDoseEventRepository();
    await repo.transition(doseId, { status: "skipped" }, newId());
    pushNativeRemindersAfterTransition(profileId);
    refresh();
  }

  async function handleSnoozed(doseId: string) {
    const preferences = await new DexiePreferencesRepository().get(accountId);
    const snoozeMinutes = preferences?.reminderDefaultSnoozeMinutes ?? 10;
    const reminderAt = new Date(Date.now() + snoozeMinutes * 60_000).toISOString();
    const repo = new DexieDoseEventRepository();
    await repo.transition(doseId, { status: "snoozed", reminderAt }, newId());
    pushNativeRemindersAfterTransition(profileId);
    refresh();
  }

  if (medsStatus === "loading" || dosesStatus === "loading") {
    return (
      <p role="status" className="p-6 text-sm text-zinc-600 dark:text-zinc-400">
        Φόρτωση…
      </p>
    );
  }

  if (medications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Καλωσήρθατε στο MedTracking</h1>
        <p className="max-w-sm text-zinc-600 dark:text-zinc-400">Δεν έχετε προσθέσει ακόμα κανένα φάρμακο.</p>
        <Link
          href="/medications/add"
          className="flex min-h-12 items-center justify-center rounded-full bg-zinc-900 px-5 py-3 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Προσθήκη πρώτου φαρμάκου
        </Link>
      </div>
    );
  }

  if (todayDoses.length === 0 && needsAttention.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <h1 className="text-xl font-semibold">Σήμερα</h1>
        <p className="max-w-sm text-zinc-600 dark:text-zinc-400">Δεν έχετε προγραμματισμένες δόσεις για σήμερα.</p>
        <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-500">
          Μπορείτε να προσθέσετε πρόγραμμα δόσεων όταν προσθέτετε ένα φάρμακο.
        </p>
        <Link href="/medications" className="min-h-12 text-sm font-medium underline">
          Δείτε τα φάρμακά σας
        </Link>
      </div>
    );
  }

  const allResolved = allTodayDosesResolved(todayDoses);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Σήμερα</h1>

      {needsAttention.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-amber-800 dark:text-amber-300">Χρειάζεται προσοχή</h2>
          <div className="flex flex-col gap-2">
            {needsAttention.map((dose) => (
              <DoseCard
                key={dose.id}
                dose={dose}
                medicationName={names.get(dose.userMedicationId) ?? "…"}
                actionable={false}
                onTaken={handleTaken}
                onSkipped={handleSkipped}
                onSnoozed={handleSnoozed}
              />
            ))}
          </div>
        </section>
      )}

      {allResolved && (
        <p role="status" className="rounded-lg bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
          Όλες οι σημερινές δόσεις έχουν καταγραφεί.
        </p>
      )}

      <div className="flex flex-col gap-2" aria-label="Σημερινές δόσεις">
        {todayDoses.map((dose) => (
          <DoseCard
            key={dose.id}
            dose={dose}
            medicationName={names.get(dose.userMedicationId) ?? "…"}
            actionable
            onTaken={handleTaken}
            onSkipped={handleSkipped}
            onSnoozed={handleSnoozed}
          />
        ))}
      </div>
    </div>
  );
}
