/**
 * Found 2026-09-13, live-device: after fixing the session-expiry redirect
 * (`session-expired-signal.ts`), the outbox entries that had failed with
 * 401s during the expired window stayed `failed` even after the user
 * signed back in. Root cause: `sync-manager.ts`'s `drainNow()` only ever
 * fires (a) once at `SyncManagerBootstrap`'s mount (the ROOT layout, which
 * persists across client-side navigation and so never remounts on
 * sign-in), (b) on a network-monitor reconnect event, or (c) on a new
 * local write via `outbox-signal.ts` — none of which a fresh sign-in
 * itself triggers. A `failed` entry whose backoff window has already
 * elapsed sits correctly-queryable (`listPending` includes it) but nothing
 * calls `drainNow()` again to actually pick it up.
 *
 * `app/(app)/layout.tsx` fires this the moment `useCurrentProfile()`
 * resolves to `"ready"` — which happens on every fresh mount of the
 * authenticated shell, including right after login — and
 * `sync-manager.ts` subscribes the same way it already does for
 * `onOutboxWrite`.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifySessionRestored(): void {
  for (const listener of listeners) listener();
}

export function onSessionRestored(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
