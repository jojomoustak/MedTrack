"use client";

import { useEffect, useState } from "react";
import type { MobilePlatform } from "@/lib/platform/mobile-platform";
import { MedianMobilePlatform } from "@/lib/platform/median-mobile-platform";
import { syncNativeRemindersNow } from "@/lib/reminders/client/native-reminder-sync";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { playSound } from "@/lib/sound/client/play-sound";
import { logger } from "@/lib/logging/logger";

type Status = "idle" | "checking" | "requesting" | "granted" | "denied" | "error";

// UX bug (2026-09-18 report): this component's own `status` is plain
// `useState`, reset to "idle" on every fresh mount (a reload, or just
// navigating away from Profile and back) — with nothing to re-derive the
// REAL current permission from, it silently forgot a grant that happened
// moments earlier in the very same session, and kept showing "enable
// notifications" forever after. One device-local flag, set the first time
// we ever observe a real (non-"idle") outcome, is enough to know "we've
// already asked on this device before" — see the mount effect below.
const ASKED_BEFORE_KEY = "medtrack:reminder-permission-asked";

/**
 * Phase 11's contextual permission request (`scheduling-android-reminders`:
 * "explain why, then request... never at app launch"). No stored on/off
 * PREFERENCE — this reflects the native notification-permission fact
 * itself (durably remembered by Android, source of truth). The one thing
 * that IS stored locally (`ASKED_BEFORE_KEY`) is narrower: not "granted
 * or not," just "has this device ever gone through this flow before" —
 * enough to know it's safe to silently re-check the real status on
 * mount (see the effect above) without ever risking an unprompted OS
 * dialog for a genuine first-time visitor.
 */
export function ReminderPermissionToggle({ profileId, platform = new MedianMobilePlatform() }: { profileId: string | null; platform?: MobilePlatform }) {
  // Lazy initializer: computed once, synchronously, at first render — NOT
  // inside the effect below, which would cause an extra render-then-set-
  // state pass for every visitor (react-hooks/set-state-in-effect). Starts
  // as "checking" only if this device has asked before (see
  // `ASKED_BEFORE_KEY`'s doc comment); the effect below then does the one
  // thing an effect is actually for here — the async re-check itself,
  // never a synchronous setState.
  const [status, setStatus] = useState<Status>(() => {
    if (!platform.isAvailable()) return "idle";
    try {
      return localStorage.getItem(ASKED_BEFORE_KEY) === "1" ? "checking" : "idle";
    } catch {
      return "idle";
    }
  });

  // Re-derives the real current status on mount, but only runs the actual
  // request when the initializer above already decided this device has
  // asked before — `requestReminderPermission()` is safe to call silently
  // in that case (this file's own doc comment above: no second system
  // dialog once a permission is already determined, granted OR denied).
  // For a genuinely first-time visitor, `status` starts "idle" and this
  // effect does nothing, preserving the explain-then-tap flow exactly as
  // before — the OS dialog only ever appears from the user's own tap on
  // the button below, never from this mount.
  useEffect(() => {
    if (status !== "checking") return;
    platform
      .requestReminderPermission()
      .then((result) => {
        if (result.status === "granted") setStatus("granted");
        else if (result.status === "denied") setStatus("denied");
        else setStatus("idle");
      })
      .catch(() => setStatus("idle"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `platform` is a stable prop (defaulted once per mount, never reassigned), intentionally excluded. `status` itself is the only real dependency: this only ever fires once, since nothing sets status back to "checking" after it resolves to granted/denied/idle.
  }, [status]);

  // Synchronous, side-effect-free capability check (`MobilePlatform.isAvailable`'s
  // own contract) — read directly during render, not via an effect+state:
  // there's no external system to synchronize with here, just a stable
  // flag this render already has everything it needs to compute.
  if (!platform.isAvailable()) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Ειδοποιήσεις υπενθύμισης</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">Διαθέσιμες μόνο μέσω της εφαρμογής MedTracking για κινητά.</p>
      </section>
    );
  }

  async function handleRequest() {
    setStatus("requesting");
    try {
      localStorage.setItem(ASKED_BEFORE_KEY, "1");
    } catch {
      // Best-effort — worst case, a future mount just falls back to the
      // explain-then-tap flow again instead of silently re-checking.
    }
    try {
      const result = await platform.requestReminderPermission();
      if (result.status === "granted") {
        setStatus("granted");
        playSound("success");
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
      <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Ειδοποιήσεις υπενθύμισης</h2>
      <p className="text-sm text-stone-500 dark:text-stone-400">
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

      {status !== "granted" && status !== "checking" && (
        <button
          type="button"
          onClick={handleRequest}
          disabled={status === "requesting"}
          className="inline-flex items-center justify-center min-h-12 self-start rounded-full border border-stone-300 px-5 py-3 font-medium disabled:opacity-60 dark:border-stone-700"
        >
          {status === "requesting" ? "Αίτημα σε εξέλιξη…" : "Ενεργοποίηση ειδοποιήσεων"}
        </button>
      )}
    </section>
  );
}
