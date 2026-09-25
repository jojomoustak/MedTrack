"use client";

import { useState } from "react";
import Link from "next/link";
import { useProfileId, useAccountId } from "@/components/shell/CurrentProfileContext";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { useGlobalSyncSummary } from "@/lib/sync/client/use-global-sync-summary";
import { createSyncManager } from "@/lib/sync/client/sync-manager";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useLowStockMedicationIds } from "@/lib/inventory/client/use-low-stock-medications";
import { useTodayDoseEvents, allTodayDosesResolved } from "@/components/today/use-today-dose-events";
import { isTerminalDoseEventStatus } from "@/lib/domain/dose-event";
import { DoseCard } from "@/components/today/DoseCard";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { DexiePreferencesRepository } from "@/lib/db-client/user-preferences-repository";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { MedianMobilePlatform } from "@/lib/platform/median-mobile-platform";
import { syncNativeRemindersNow } from "@/lib/reminders/client/native-reminder-sync";
import { DexieMedicationPackageRepository } from "@/lib/db-client/medication-package-repository";
import { DexieInventoryTransactionRepository } from "@/lib/db-client/inventory-transaction-repository";
import { consumeInventoryForDoseTaken } from "@/lib/inventory/client/consume-dose";
import { recordMedicationInteraction } from "@/lib/medications/client/record-interaction";
import { playSound } from "@/lib/sound/client/play-sound";
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
 * Journey 5's Today banner — same icon+text cue as `InventorySummary`
 * (medication detail) and the Medications list badge, never color alone.
 * Non-blocking: rendered above the dose list, never gates it.
 */
function LowStockBanner({ names }: { names: string[] }) {
  const label = names.length === 1 ? `${names[0]} — χαμηλό απόθεμα.` : `${names.length} φάρμακα με χαμηλό απόθεμα: ${names.join(", ")}.`;
  return (
    <Link
      href="/medications"
      onClick={() => playSound("button")}
      role="status"
      className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 transition-transform duration-150 active:scale-[0.98] dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <LowStockIcon />
      {label}
    </Link>
  );
}

function LowStockIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor" className="shrink-0">
      <path d="M10 2 1 18h18L10 2Zm0 5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 8a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 10 15Z" />
    </svg>
  );
}

/** The same pill-capsule mark `NavIcon`'s "medications" tab already draws — reused here rather than a one-off brand mark, so the wordmark's icon is the app's own established shape, not a new invention. */
function BrandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform="rotate(-45 12 12)">
        <rect x="4" y="8" width="16" height="8" rx="4" />
        <path d="M12 8v8" />
      </g>
    </svg>
  );
}

/**
 * Design pass (2026-09-26): full-bleed gradient band replacing the plain
 * "Σήμερα" heading — direction-comparison mockups (built to react to, not
 * guessed at) landed here specifically. Carries the "MedTracking"
 * wordmark + icon and the sync-status indicator itself (mirroring
 * `AppBar`'s own retry logic exactly) — `AppBar` hides itself on this one
 * route so the title doesn't render twice; every other screen still gets
 * it from `AppBar` unchanged. The soft radial glow and the progress bar
 * are decorative/informational only, never the sole source of any status
 * a screen reader needs (the dose cards below still state their own
 * status in text).
 */
function TodayHero({ resolved, total }: { resolved: number; total: number }) {
  const summary = useGlobalSyncSummary();
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await createSyncManager().drainNow();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-b-[28px] bg-linear-to-br from-accent-600 to-accent-800 px-5 pt-5 pb-7.5 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%)" }}
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold opacity-85">
            <BrandIcon />
            MedTracking
          </span>
          {summary === "failed" ? (
            <SyncStatusChip state={summary} onRetry={retrying ? undefined : handleRetry} />
          ) : (
            summary && (
              <Link href="/profile" aria-label="Κατάσταση συγχρονισμού">
                <SyncStatusChip state={summary} />
              </Link>
            )
          )}
        </div>
        <h1 className="mt-2.5 text-2xl font-bold">Σήμερα</h1>
        {total > 0 && (
          <div className="mt-3.5 flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white transition-[width] duration-300" style={{ width: `${Math.round((resolved / total) * 100)}%` }} />
            </div>
            <span className="text-sm font-semibold whitespace-nowrap opacity-90">
              {resolved} από {total}
            </span>
          </div>
        )}
      </div>
    </div>
  );
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
  // Journey 5 (Phase 3 §3 / Phase 0 Maria persona): "same non-color
  // low-stock cue... Today (banner)... Medications list (badge)...
  // medication detail (inline banner)." The latter two already existed
  // (`InventorySummary`, `app/(app)/medications/page.tsx`) — Today's own
  // banner was the missing one (UX audit, 2026-09-18).
  const lowStockIds = useLowStockMedicationIds(profileId, medications);
  const lowStockNames = [...lowStockIds].map((id) => names.get(id)).filter((n): n is string => Boolean(n));
  // A dose crossed from "not yet due" to "due now" while this page stayed
  // open (`useTodayDoseEvents`'s own doc comment) — the in-app chime,
  // separate from the native reminder notification (Phase 11), which
  // fires from the AlarmManager/OS layer regardless of whether this page
  // is even open.
  const { status: dosesStatus, todayDoses, needsAttention, refresh } = useTodayDoseEvents(profileId, () => playSound("notification"));

  async function handleTaken(doseId: string) {
    const repo = new DexieDoseEventRepository();
    const dose = await repo.transition(doseId, { status: "taken", takenAt: new Date().toISOString() }, newId());
    // Phase 9: decrement inventory (FIFO-attributed to the oldest open
    // package) the moment a dose is actually marked Taken — best-effort,
    // never blocks or reverts the dose transition itself (see
    // consumeInventoryForDoseTaken's own doc).
    await consumeInventoryForDoseTaken(dose, {
      medicationPackages: new DexieMedicationPackageRepository(),
      inventoryTransactions: new DexieInventoryTransactionRepository(),
    });
    recordMedicationInteraction(profileId, dose.userMedicationId, "marked_taken");
    pushNativeRemindersAfterTransition(profileId);
    refresh();
  }

  /**
   * The one recovery path out of `missed` (`isDoseEventTransitionAllowed`,
   * `DoseCard`'s `onTakenLate`) — "I forgot to log it, but I did take
   * it." Consumes inventory exactly like `handleTaken`, since a late dose
   * is still a real dose.
   */
  async function handleTakenLate(doseId: string) {
    const repo = new DexieDoseEventRepository();
    const dose = await repo.transition(doseId, { status: "taken_late", takenAt: new Date().toISOString() }, newId());
    await consumeInventoryForDoseTaken(dose, {
      medicationPackages: new DexieMedicationPackageRepository(),
      inventoryTransactions: new DexieInventoryTransactionRepository(),
    });
    recordMedicationInteraction(profileId, dose.userMedicationId, "marked_taken");
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
      <p role="status" className="p-6 text-sm text-stone-600 dark:text-stone-400">
        Φόρτωση…
      </p>
    );
  }

  if (medications.length === 0) {
    // UX feedback (2026-09-22): had its own centered CTA here, duplicating
    // AddMedicationFab (fixed bottom-right, already on-screen on /today
    // regardless of this empty state).
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Καλωσήρθατε στο MedTracking</h1>
        <p className="max-w-sm text-stone-600 dark:text-stone-400">Δεν έχετε προσθέσει ακόμα κανένα φάρμακο.</p>
      </div>
    );
  }

  if (todayDoses.length === 0 && needsAttention.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <TodayHero resolved={0} total={0} />
        <div className="flex flex-col items-center gap-3 px-4 pb-4 text-center">
          {lowStockNames.length > 0 && (
            <div className="w-full max-w-sm">
              <LowStockBanner names={lowStockNames} />
            </div>
          )}
          <p className="max-w-sm text-stone-600 dark:text-stone-400">Δεν έχετε προγραμματισμένες δόσεις για σήμερα.</p>
          <p className="max-w-sm text-sm text-stone-500 dark:text-stone-400">
            Μπορείτε να προσθέσετε πρόγραμμα δόσεων όταν προσθέτετε ένα φάρμακο.
          </p>
          <Link href="/medications" className="inline-flex items-center justify-center min-h-12 text-sm font-medium underline">
            Δείτε τα φάρμακά σας
          </Link>
        </div>
      </div>
    );
  }

  const allResolved = allTodayDosesResolved(todayDoses);
  const resolvedCount = todayDoses.filter((d) => isTerminalDoseEventStatus(d.status)).length;

  return (
    <div className="flex flex-col gap-4">
      <TodayHero resolved={resolvedCount} total={todayDoses.length} />
      <div className="flex flex-col gap-4 px-4 pb-4">
        {lowStockNames.length > 0 && <LowStockBanner names={lowStockNames} />}

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
                  onTakenLate={handleTakenLate}
                />
              ))}
            </div>
          </section>
        )}

        {allResolved && (
          <p role="status" className="rounded-lg bg-stone-100 px-4 py-3 text-sm dark:bg-stone-900">
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
    </div>
  );
}
