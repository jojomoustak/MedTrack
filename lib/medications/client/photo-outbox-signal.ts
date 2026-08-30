/**
 * Same choke-point pattern as `lib/sync/client/outbox-signal.ts`, kept as
 * its own separate channel rather than reusing that one: the photo
 * outbox has its own dedicated worker/in-flight guard in
 * `sync-manager.ts` (mirroring how the offline-index and learned-mapping
 * syncs each get their own trigger even though all three also share the
 * "just came online" trigger) — sharing the signal would couple two
 * otherwise-independent drain loops for no reason.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyPhotoOutboxWrite(): void {
  for (const listener of listeners) listener();
}

export function onPhotoOutboxWrite(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
