"use client";

import { hydrateLocalDataFromServer } from "@/lib/sync/client/hydrate-local-data";

/**
 * Catching up with the server: pulling what changed elsewhere (another
 * device, a restore after signing in) into this phone.
 *
 * Opening a screen is not news from the server: catch up at most once a
 * minute per profile, and again whenever the app comes back to the
 * foreground (2026-10-09). It used to run only from the medicines list
 * (`useMedicationsList`), so a screen without one, Lists say, never caught
 * up: opened first on a newly signed-in phone it showed «no lists» until
 * Today was visited (found 2026-10-19). The app shell now asks on sign-in,
 * on launch and on every return to the foreground; screens still ask too,
 * and share the same pass.
 */
const CATCH_UP_EVERY_MS = 60_000;
const lastCatchUpAt = new Map<string, number>();
const running = new Map<string, Promise<void>>();

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") lastCatchUpAt.clear();
  });
}

/**
 * The pass under way for `profileId`, or a new one when one is due; null
 * when it caught up less than a minute ago and nothing is running.
 */
export function catchUpWithServer(profileId: string): Promise<void> | null {
  const current = running.get(profileId);
  if (current) return current;
  const last = lastCatchUpAt.get(profileId);
  if (last !== undefined && Date.now() - last < CATCH_UP_EVERY_MS) return null;
  lastCatchUpAt.set(profileId, Date.now());
  const pass = hydrateLocalDataFromServer({ profileId }).finally(() => running.delete(profileId));
  running.set(profileId, pass);
  return pass;
}

/** Test seam: the next ask catches up again. */
export function __resetCatchUpForTests(): void {
  lastCatchUpAt.clear();
  running.clear();
}
