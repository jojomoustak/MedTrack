"use client";

import { useState } from "react";
import type { MobilePlatform } from "@/lib/platform/mobile-platform";
import { MedianMobilePlatform } from "@/lib/platform/median-mobile-platform";
import { syncNativeRemindersNow } from "@/lib/reminders/client/native-reminder-sync";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { logger } from "@/lib/logging/logger";

type Status = "idle" | "requesting" | "granted" | "denied" | "error";

/**
 * Phase 11's contextual permission request (`scheduling-android-reminders`:
 * "explain why, then request... never at app launch"). No stored
 * on/off preference — this reflects the native notification-permission
 * fact itself (durably remembered by Android), so there's nothing to sync
 * or keep consistent across devices; re-tapping this after granting just
 * resolves `granted` again without a second system dialog.
 */
export function ReminderPermissionToggle({ profileId, platform = new MedianMobilePlatform() }: { profileId: string | null; platform?: MobilePlatform }) {
  const [status, setStatus] = useState<Status>("idle");

  // Synchronous, side-effect-free capability check (`MobilePlatform.isAvailable`'s
  // own contract) — read directly during render, not via an effect+state:
  // there's no external system to synchronize with here, just a stable
  // flag this render already has everything it needs to compute.
  if (!platform.isAvailable()) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Ειδοποιήσεις υπενθύμισης</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Διαθέσιμες μόνο μέσω της εφαρμογής MedTracking για κινητά.</p>
      </section>
    );
  }

  async function handleRequest() {
    setStatus("requesting");
    try {
      const result = await platform.requestReminderPermission();
      if (result.status === "granted") {
        setStatus("granted");
        // Isolated from the outer try/catch on purpose: repository
        // construction below happens synchronously, as call arguments,
        // before `syncNativeRemindersNow`'s own async body ever runs — a
        // synchronous throw there (e.g. no IndexedDB) must never flip an
        // already-successful "granted" outcome back to "error".
        if (profileId) {
          try {
            syncNativeRemindersNow(profileId, {
              doseEvents: new DexieDoseEventRepository(),
              userMedications: new DexieUserMedicationRepository(),
              catalogCache: new DexieCatalogCacheRepository(),
              offlineIndex: new DexieOfflineIndexRepository(),
              platform,
            }).catch((err) => logger.warn("profile.native_reminder_sync_failed", { message: err instanceof Error ? err.message : String(err) }));
          } catch (err) {
            logger.warn("profile.native_reminder_sync_failed", { message: err instanceof Error ? err.message : String(err) });
          }
        }
      } else if (result.status === "denied") {
        setStatus("denied");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Ειδοποιήσεις υπενθύμισης</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Οι υπενθυμίσεις δόσεων λειτουργούν στη συσκευή σας ακόμα και χωρίς σύνδεση στο διαδίκτυο. Χρειάζονται άδεια ειδοποιήσεων.
      </p>

      {status === "granted" && (
        <p role="status" className="text-sm font-medium text-green-700 dark:text-green-400">
          Οι ειδοποιήσεις είναι ενεργές.
        </p>
      )}
      {status === "denied" && (
        <p role="status" className="text-sm text-amber-800 dark:text-amber-300">
          Η άδεια απορρίφθηκε. Μπορείτε να την ενεργοποιήσετε από τις ρυθμίσεις ειδοποιήσεων της συσκευής σας.
        </p>
      )}
      {status === "error" && (
        <p role="status" className="text-sm text-red-700 dark:text-red-400">
          Κάτι πήγε στραβά. Δοκιμάστε ξανά.
        </p>
      )}

      {status !== "granted" && (
        <button
          type="button"
          onClick={handleRequest}
          disabled={status === "requesting"}
          className="min-h-12 self-start rounded-full border border-zinc-300 px-5 py-3 font-medium disabled:opacity-60 dark:border-zinc-700"
        >
          {status === "requesting" ? "Αίτημα σε εξέλιξη…" : "Ενεργοποίηση ειδοποιήσεων"}
        </button>
      )}
    </section>
  );
}
