import type { OutboxEntry } from "@/lib/domain/outbox";
import type { SyncChangesResponseBody, SyncMutationRequest, SyncMutationsResponseBody } from "@/lib/sync/protocol";
import { clearCachedProfile } from "@/lib/auth/client/use-current-profile";
import { notifySessionExpired } from "@/lib/auth/client/session-expired-signal";

export function outboxEntryToWireMutation(entry: OutboxEntry): SyncMutationRequest {
  return {
    clientMutationId: entry.clientMutationId,
    // The wire schema only accepts the entity types this phase's server
    // handlers implement (`lib/sync/server/mutations.ts`); the domain-level
    // `SyncEntityType` union is wider (Phase 6 will grow both together).
    // Only outbox entries for the implemented types are ever created today
    // (`lib/db-client/*-repository.ts`), so this narrowing is safe now and
    // will need revisiting the day another entity's repository is added.
    entityType: entry.entityType as SyncMutationRequest["entityType"],
    entityId: entry.entityId,
    operation: entry.operation,
    payload: entry.payload as Record<string, unknown>,
    baseVersion: entry.baseVersion,
  };
}

export class SyncApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SyncApiError";
  }
}

/**
 * The one choke point every sync HTTP call passes through — a 401/403
 * here means the session is genuinely dead server-side, not a transient
 * network blip, so retrying (what a plain thrown error would otherwise
 * lead to) can never succeed. Clears the stale cached profile immediately
 * (same as `use-current-profile.ts`'s own 401-handling) and fires the
 * signal `app/(app)/layout.tsx` listens for to force a re-login rather
 * than leaving the user staring at a "failed — tap to retry" chip that
 * will fail identically forever.
 */
function reportIfUnauthenticated(status: number): void {
  if (status === 401 || status === 403) {
    clearCachedProfile();
    notifySessionExpired();
  }
}

export async function postMutations(
  mutations: SyncMutationRequest[],
  fetchImpl: typeof fetch = fetch,
): Promise<SyncMutationsResponseBody> {
  const response = await fetchImpl("/api/sync/mutations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ mutations }),
  });
  if (!response.ok) {
    reportIfUnauthenticated(response.status);
    throw new SyncApiError(`Sync mutations request failed with status ${response.status}`, response.status);
  }
  return response.json() as Promise<SyncMutationsResponseBody>;
}

export async function pullChanges(
  cursor: number,
  fetchImpl: typeof fetch = fetch,
  limit = 100,
): Promise<SyncChangesResponseBody> {
  const url = `/api/sync/changes?cursor=${cursor}&limit=${limit}`;
  const response = await fetchImpl(url, { credentials: "include", cache: "no-store" });
  if (!response.ok) {
    reportIfUnauthenticated(response.status);
    throw new SyncApiError(`Sync changes request failed with status ${response.status}`, response.status);
  }
  return response.json() as Promise<SyncChangesResponseBody>;
}
