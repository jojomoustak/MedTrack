/**
 * Fired when the signed-in profile is cleared from this device (sign-out,
 * an expired session): in-memory caches that belong to it let go. A plain
 * signal with no imports, so modules the auth code itself depends on (the
 * local database, through it the photo thumbnails) can listen without an
 * import cycle.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyProfileCleared(): void {
  for (const listener of listeners) listener();
}

export function onProfileCleared(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
