"use client";

import { useEffect, useState } from "react";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { catchUpWithServer } from "@/lib/sync/client/catch-up";
import { readSnapshot, refreshSnapshot } from "@/lib/client-cache/snapshot";
import { onLocalDataHydrated } from "@/lib/sync/client/local-data-signal";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

export type MedicationsListStatus = "loading" | "ready";

export interface MedicationsListState {
  status: MedicationsListStatus;
  medications: UserMedicationRecord[];
}

/**
 * Longest a first restore may keep the list on its loading placeholders
 * before showing what is stored (possibly nothing): a stalled network must
 * not leave the screen loading forever. Pages that arrive later still show.
 */
export const FIRST_RESTORE_WAIT_MS = 8000;

/** Test seam: the next mount catches up again. */
export { __resetCatchUpForTests } from "@/lib/sync/client/catch-up";

/**
 * Local-first: reads whatever's already in Dexie immediately (works
 * offline, no spinner needed for the common case), then — best-effort,
 * in the background — pulls anything new from the server and refreshes.
 * Shared by the Today and Medications tabs, both of which need to know
 * "does this profile have any medications yet" (Today) or "show them all"
 * (Medications).
 *
 * A screen opened before starts from what it showed last time
 * (`lib/client-cache/snapshot.ts`), and an unchanged re-read keeps the
 * same array, so nothing keyed on it recomputes.
 */
export function useMedicationsList(profileId: string | null): MedicationsListState {
  const key = `medications:${profileId}`;
  const [state, setState] = useState<MedicationsListState>(() => {
    const cached = profileId ? readSnapshot<UserMedicationRecord[]>(key) : undefined;
    return cached ? { status: "ready", medications: cached } : { status: "loading", medications: [] };
  });

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    const repo = new DexieUserMedicationRepository();

    function publish(list: UserMedicationRecord[]) {
      const medications = refreshSnapshot(key, list);
      setState((prev) => (prev.status === "ready" && prev.medications === medications ? prev : { status: "ready", medications }));
    }

    // A restore stores its pages one at a time: show each as it lands.
    const unsubscribe = onLocalDataHydrated(() => {
      void repo.list(profileId!).then((list) => {
        if (!cancelled && list.length > 0) publish(list);
      });
    });
    let giveUpTimer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      const local = await repo.list(profileId!);
      if (cancelled) return;
      // At most once a minute (`lib/sync/client/catch-up.ts`), shared with the app shell's own catch-up.
      const pass = catchUpWithServer(profileId!);
      // Nothing stored yet and a pull under way: a first restore (just
      // signed in, new phone, cleared data). Keep the loading placeholders
      // rather than show "no medicines" until the medicines arrive
      // (owner-reported after signing out and in, 2026-10-15).
      const firstRestore = local.length === 0 && pass !== null;
      if (firstRestore) {
        giveUpTimer = setTimeout(() => {
          if (!cancelled) void repo.list(profileId!).then((list) => !cancelled && publish(list));
        }, FIRST_RESTORE_WAIT_MS);
      } else {
        publish(local);
      }

      if (!pass) return;
      await pass;
      if (cancelled) return;
      publish(await repo.list(profileId!));
    }

    void load();
    return () => {
      cancelled = true;
      unsubscribe();
      if (giveUpTimer) clearTimeout(giveUpTimer);
    };
  }, [profileId, key]);

  return state;
}
