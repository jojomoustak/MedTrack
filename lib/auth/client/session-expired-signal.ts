/**
 * Found 2026-09-13, live-device: a sync mutation batch failed 5 times in a
 * row, every attempt with `status: 401` — the session had genuinely
 * expired server-side, but the app kept showing cached content (per
 * `use-current-profile.ts`'s own deliberate offline-fallback design) and
 * the outbox worker treated every one of those 401s exactly like a plain
 * network blip: mark `failed`, retry with backoff. Retrying can never
 * succeed once the session is actually dead — the user needs to
 * re-authenticate, and nothing told them that specifically (the sync
 * status chip's generic "failed — tap to retry" doesn't distinguish
 * "transient" from "your session is gone").
 *
 * `lib/sync/client/api.ts`'s `postMutations`/`pullChanges` are the ONE
 * choke point every sync HTTP call passes through (same "single choke
 * point" reasoning `outbox-signal.ts`'s own doc comment used for the
 * missing-drain-trigger fix) — a 401/403 there fires this signal.
 * `app/(app)/layout.tsx` subscribes and force-navigates to `/login` with a
 * distinct "your session expired" message, the same query-param-driven
 * messaging convention `google-auth-errors.ts` already uses for `/login`.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifySessionExpired(): void {
  for (const listener of listeners) listener();
}

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
