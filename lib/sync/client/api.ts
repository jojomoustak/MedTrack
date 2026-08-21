import type { OutboxEntry } from "@/lib/domain/outbox";
import type { SyncChangesResponseBody, SyncMutationRequest, SyncMutationsResponseBody } from "@/lib/sync/protocol";

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
    throw new SyncApiError(`Sync changes request failed with status ${response.status}`, response.status);
  }
  return response.json() as Promise<SyncChangesResponseBody>;
}
