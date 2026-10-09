"use client";

import { onOutboxWrite } from "@/lib/sync/client/outbox-signal";
import { onLocalDataHydrated } from "@/lib/sync/client/local-data-signal";

/**
 * What each screen last showed, kept in memory for the life of the page
 * (2026-10-09, "make the app faster"): returning to a tab draws it at once
 * from here instead of flashing "Φόρτωση…" while IndexedDB is read again;
 * the screen still re-reads and updates if anything changed.
 *
 * Memory only — never written to storage, so nothing here outlives the
 * app's own IndexedDB copy. Keys always include the profile id, so one
 * signed-in profile can never be shown another's data; `clearSnapshots`
 * runs on sign-out and account deletion regardless
 * (`clearCachedProfile`).
 */
const snapshots = new Map<string, unknown>();

export function readSnapshot<T>(key: string): T | undefined {
  return snapshots.get(key) as T | undefined;
}

export function writeSnapshot<T>(key: string, value: T): void {
  snapshots.set(key, value);
}

export function clearSnapshots(): void {
  snapshots.clear();
}

function forgetSnapshots(prefixes: readonly string[]): void {
  for (const key of snapshots.keys()) if (prefixes.some((prefix) => key.startsWith(prefix))) snapshots.delete(key);
}

/**
 * Which remembered screens a local write can make out of date, by what
 * was written — so returning to them after a change re-reads rather than
 * flashing the pre-change version. Anything not listed forgets
 * everything (the safe default for a type added later).
 */
const AFFECTED_BY: Record<string, readonly string[]> = {
  doseEvent: ["today-doses:", "dose-range:"],
  userMedication: ["medications:", "low-stock:", "schedule-summaries:"],
  medicationSchedule: ["schedules:", "schedule-summaries:", "dose-range:", "today-doses:"],
  medicationPackage: ["low-stock:"],
  medicationInventoryTransaction: ["low-stock:"],
  purchaseList: ["purchase-lists:", "purchase-list-summaries:"],
  purchaseListItem: ["purchase-list-summaries:"],
  favorite: [],
  recentlyUsedEvent: [],
  userPreferences: [],
};

if (typeof window !== "undefined") {
  onOutboxWrite((entityType) => {
    const affected = entityType === undefined ? undefined : AFFECTED_BY[entityType];
    if (affected) forgetSnapshots(affected);
    else clearSnapshots();
  });
  // Changes from the server (another device) or the scheduling tick: screens
  // on display re-read through this same signal; the rest start fresh.
  onLocalDataHydrated((source) => {
    if (source === "scheduling") forgetSnapshots(["today-doses:", "dose-range:"]);
    else clearSnapshots();
  });
}

/**
 * `next` when it differs from `previous`, otherwise `previous` itself — so
 * an unchanged re-read keeps the same object and nothing downstream
 * (names, strengths, schedules keyed on it) recomputes or redraws. The
 * values are small plain records, so comparing their JSON is cheap.
 */
export function keepIfSame<T>(previous: T | undefined, next: T): T {
  return previous !== undefined && JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}

/**
 * Reads the snapshot at `key`, settles on `next` (keeping the old object
 * if unchanged) and stores it. Returns what to put in React state.
 */
export function refreshSnapshot<T>(key: string, next: T): T {
  const settled = keepIfSame(readSnapshot<T>(key), next);
  snapshots.set(key, settled);
  return settled;
}
