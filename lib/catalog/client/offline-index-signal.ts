/**
 * Real bug found 2026-08-28 (a fresh reinstall/data-clear + login, then
 * checking the medications list before the background offline-index sync
 * finished): `app/(app)/medications/page.tsx`'s display-name resolution
 * only re-runs when the `medications` array itself changes — it has no
 * way to know "the offline index (or catalog cache) that resolves a
 * `catalogProductId` to a real name just got populated, try again." A
 * medication pulled back from the server via `hydrateLocalDataFromServer`
 * arrives correctly, but if `syncOfflineIndexNow()` (a separate,
 * independent background sync — `sync-manager.ts`) hasn't finished yet at
 * that exact moment, the name permanently shows the "Φάρμακο από
 * κατάλογο" placeholder, even though the real name arrives moments later
 * — nothing ever tells the page to look again.
 *
 * Same choke-point signal pattern already used for outbox writes
 * (`lib/sync/client/outbox-signal.ts`) — deliberately not a bespoke
 * per-page workaround, since any other screen resolving a
 * `catalogProductId` to display data has the exact same latent bug.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyOfflineIndexUpdated(): void {
  for (const listener of listeners) listener();
}

export function onOfflineIndexUpdated(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
