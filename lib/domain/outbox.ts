/**
 * The durable local outbox (`designing-offline-sync`, Phase 1 §5,
 * ADR-007): every local mutation writes its entity change AND an outbox
 * entry in the same local transaction, so a mutation can never exist
 * without something that will eventually replay it to the server.
 *
 * `OutboxEntry` is storage-agnostic domain shape — the Dexie table in
 * `lib/db-client/dexie.ts` stores exactly this shape; nothing outside the
 * repository layer should touch IndexedDB directly (ADR-008).
 */
import type { SyncEntityType } from "@/lib/domain/sync";

export type OutboxOperation = "create" | "update" | "delete";

/** Outbox-entry-level status — distinct from the entity's own `SyncState` (Phase 1 §5): this tracks the delivery attempt, the entity's `syncState` is what the UI shows. */
export type OutboxStatus = "pending" | "syncing" | "failed";

export interface OutboxEntry<TPayload = Record<string, unknown>> {
  /** The idempotency key — matches `sync_mutation.client_mutation_id` server-side (Phase 2 §5.1). Client-generated, stable for this one mutation attempt. */
  clientMutationId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: OutboxOperation;
  /** Full record snapshot (not a diff) — simplest to replay correctly and matches how the server upserts. */
  payload: TPayload;
  /** For optimistic-concurrency entities (Phase 2 §5): the version this mutation was built against, so the server can detect a real conflict. Undefined for LWW/ledger/idempotent-by-id entities. */
  baseVersion?: number;
  /** Device clock at the moment of the local write — used for LWW comparison (Phase 2 §2.3/§2.10) and for ordering retries. Never authoritative on the server (that's `sync_change_log.occurred_at`, server-set). */
  createdAt: string;
  status: OutboxStatus;
  attempts: number;
  /** Backoff scheduling — the worker skips entries whose `nextAttemptAt` is in the future. */
  nextAttemptAt: string;
  lastError?: string;
}

/** Exponential backoff with a cap, plus jitter to avoid a thundering herd of retries all firing at once after a reconnect. */
export function computeNextAttemptDelayMs(attempts: number): number {
  const BASE_MS = 2000;
  const MAX_MS = 5 * 60 * 1000; // 5 minutes
  const exponential = Math.min(BASE_MS * 2 ** attempts, MAX_MS);
  const jitter = Math.random() * 0.3 * exponential;
  return Math.round(exponential + jitter);
}
