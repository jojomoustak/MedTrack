/**
 * Fired when a server pull (`hydrateLocalDataFromServer`) has written new
 * records into local storage. Views that read local data once on mount
 * (Today's doses, the Calendar) subscribe and re-read — otherwise a fresh
 * install, a second device, or a reinstall shows an empty Today/Calendar
 * until the user navigates away and back, even though the data has
 * already arrived (found 2026-10-04 with a fresh browser profile).
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyLocalDataHydrated(): void {
  for (const listener of listeners) listener();
}

export function onLocalDataHydrated(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
