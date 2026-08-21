/**
 * Fourth real bug found via a live browser click-through against a local
 * Postgres + Playwright, after the local-dev driver fix and the missing
 * `Profile`-row fix: `SyncManager.start()` (see `sync-manager.ts`) only
 * ever calls `drainNow()` (a) once at mount and (b) on an
 * offline->online network transition. Neither fires when a NEW outbox
 * entry is written while the app is already online and already past its
 * one-time initial drain (the overwhelmingly common case — e.g. adding a
 * medication a few seconds after the app loaded) — so freshly-queued
 * mutations sat in the outbox indefinitely, visible locally, never
 * reaching the server, confirmed by querying Postgres directly and
 * finding zero rows despite a visibly-successful "Add Medication" flow
 * in the browser.
 *
 * `lib/db-client/*-repository.ts` write to the outbox table through two
 * different paths (some via `DexieOutboxRepository.enqueue()`, some via
 * a raw `db.outbox.put()` inside a multi-table Dexie transaction for
 * atomicity with the owning entity's row — see
 * `user-medication-repository.ts`), so hooking every call site
 * individually would be easy to miss again. Instead, `dexie.ts` fires
 * this signal from a single Dexie `creating` hook on the `outbox` table
 * itself (see the constructor there) — the one choke point every write
 * necessarily passes through, regardless of which repository or
 * transaction shape triggered it. `sync-manager.ts` subscribes here and
 * requests a drain whenever it fires.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyOutboxWrite(): void {
  for (const listener of listeners) listener();
}

export function onOutboxWrite(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
