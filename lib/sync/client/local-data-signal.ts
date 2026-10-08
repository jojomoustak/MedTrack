/**
 * Fired when something other than the current screen has written new
 * records into local storage, so views that read local data once on mount
 * (Today's doses, the Calendar) re-read:
 *
 * - `"pull"`: a server pull (`hydrateLocalDataFromServer`) — otherwise a
 *   fresh install, a second device, or a reinstall shows an empty
 *   Today/Calendar until the user navigates away and back (found
 *   2026-10-04 with a fresh browser profile).
 * - `"scheduling"`: the sync manager's scheduling tick generated upcoming
 *   doses or swept overdue ones.
 *
 * The source lets the sync manager re-run its scheduling tick after a pull
 * without re-triggering itself from its own notification.
 */
export type LocalDataSource = "pull" | "scheduling";
type Listener = (source: LocalDataSource) => void;

const listeners = new Set<Listener>();

export function notifyLocalDataHydrated(source: LocalDataSource = "pull"): void {
  for (const listener of listeners) listener(source);
}

export function onLocalDataHydrated(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
