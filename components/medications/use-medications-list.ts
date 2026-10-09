"use client";

import { useEffect, useState } from "react";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { hydrateLocalDataFromServer } from "@/lib/sync/client/hydrate-local-data";
import { readSnapshot, refreshSnapshot } from "@/lib/client-cache/snapshot";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

export type MedicationsListStatus = "loading" | "ready";

export interface MedicationsListState {
  status: MedicationsListStatus;
  medications: UserMedicationRecord[];
}

/**
 * Opening a screen is not news from the server: catch up at most once a
 * minute per profile, and again whenever the app comes back to the
 * foreground (2026-10-09). This used to pull on every screen that listed
 * medications — a server round trip, and a redraw of every name, strength
 * and schedule after it, on each tap.
 */
const CATCH_UP_EVERY_MS = 60_000;
const lastCatchUpAt = new Map<string, number>();

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") lastCatchUpAt.clear();
  });
}

function catchUpIsDue(profileId: string): boolean {
  const last = lastCatchUpAt.get(profileId);
  if (last !== undefined && Date.now() - last < CATCH_UP_EVERY_MS) return false;
  lastCatchUpAt.set(profileId, Date.now());
  return true;
}

/** Test seam: the next mount catches up again. */
export function __resetCatchUpForTests(): void {
  lastCatchUpAt.clear();
}

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

    async function load() {
      const local = await repo.list(profileId!);
      if (cancelled) return;
      publish(local);

      if (!catchUpIsDue(profileId!)) return;
      await hydrateLocalDataFromServer({ userMedication: repo, profileId: profileId! });
      if (cancelled) return;
      publish(await repo.list(profileId!));
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId, key]);

  return state;
}
