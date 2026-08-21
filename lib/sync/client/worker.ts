/**
 * The sync worker: drains the outbox against the server sync API
 * (`designing-offline-sync`, ADR-007, Phase 1 §5).
 *
 *   drain → POST /api/sync/mutations → per-result:
 *     applied  → repository.applyRemote(serverRecord), outbox entry removed
 *     conflict → repository.markConflict(), outbox entry removed (never
 *                auto-retried into a loop — Phase 3 §5: a conflict
 *                persists until the USER resolves it, not until the
 *                worker gives up)
 *     rejected/account_deleted → repository.markFailed(), outbox entry
 *                kept with backoff (Phase 3 §5: "failed" persists,
 *                tap-to-retry, never silently disappears)
 *   network-level failure (fetch itself threw) → every entry in this
 *     batch goes back to `pending` with backoff — nothing is marked
 *     `conflict`/`rejected` on a mere connectivity failure.
 */
import { computeNextAttemptDelayMs } from "@/lib/domain/outbox";
import type { OutboxEntry } from "@/lib/domain/outbox";
import type { OutboxRepository } from "@/lib/domain/repositories";
import { outboxEntryToWireMutation, postMutations as defaultPostMutations } from "@/lib/sync/client/api";
import type { SyncMutationResult } from "@/lib/sync/protocol";
import { logger } from "@/lib/logging/logger";

export interface SyncWorkerDeps {
  outbox: OutboxRepository;
  /** Dispatches a server result back into the right entity repository (applyRemote/markConflict/markFailed). */
  applyResult: (entry: OutboxEntry, result: SyncMutationResult) => Promise<void>;
  postMutations?: typeof defaultPostMutations;
  now?: () => string;
  /** How many outbox entries to send per request — matches the server's `syncMutationsRequestBodySchema` max. */
  batchSize?: number;
}

export interface DrainSummary {
  attempted: number;
  synced: number;
  conflicts: number;
  failed: number;
}

function addMs(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

/** Drains everything currently due. Safe to call repeatedly/concurrently is NOT guaranteed — callers should serialize invocations (see `runSyncLoop`). */
export async function drainOutbox(deps: SyncWorkerDeps): Promise<DrainSummary> {
  const now = deps.now ?? (() => new Date().toISOString());
  const post = deps.postMutations ?? defaultPostMutations;
  const batchSize = deps.batchSize ?? 50;

  const pending = await deps.outbox.listPending(now());
  if (pending.length === 0) {
    return { attempted: 0, synced: 0, conflicts: 0, failed: 0 };
  }

  const batch = pending.slice(0, batchSize);
  for (const entry of batch) {
    await deps.outbox.markSyncing(entry.clientMutationId);
  }

  const summary: DrainSummary = { attempted: batch.length, synced: 0, conflicts: 0, failed: 0 };

  let responseResults: SyncMutationResult[];
  try {
    const response = await post(batch.map(outboxEntryToWireMutation));
    responseResults = response.results;
  } catch (err) {
    logger.warn("sync.drain.network_failure", { attempted: batch.length });
    for (const entry of batch) {
      const attempts = entry.attempts + 1;
      await deps.outbox.markFailed(entry.clientMutationId, err instanceof Error ? err.message : "network error", addMs(now(), computeNextAttemptDelayMs(attempts)));
    }
    summary.failed = batch.length;
    return summary;
  }

  const byId = new Map(batch.map((e) => [e.clientMutationId, e]));
  for (const result of responseResults) {
    const entry = byId.get(result.clientMutationId);
    if (!entry) continue;

    if (result.result === "applied") {
      await deps.applyResult(entry, result);
      await deps.outbox.markSynced(entry.clientMutationId);
      summary.synced++;
    } else if (result.result === "conflict") {
      await deps.applyResult(entry, result);
      await deps.outbox.remove(entry.clientMutationId);
      summary.conflicts++;
      logger.info("sync.drain.conflict", { entityType: entry.entityType });
    } else {
      await deps.applyResult(entry, result);
      const attempts = entry.attempts + 1;
      await deps.outbox.markFailed(entry.clientMutationId, result.error ?? result.result, addMs(now(), computeNextAttemptDelayMs(attempts)));
      summary.failed++;
    }
  }

  return summary;
}

/**
 * Repeatedly drains until the outbox is empty or nothing more is
 * currently due (bounded — never an infinite loop even if the server
 * keeps returning failures within the same tick).
 */
export async function drainOutboxFully(deps: SyncWorkerDeps, maxRounds = 20): Promise<DrainSummary> {
  const total: DrainSummary = { attempted: 0, synced: 0, conflicts: 0, failed: 0 };
  for (let round = 0; round < maxRounds; round++) {
    const result = await drainOutbox(deps);
    total.attempted += result.attempted;
    total.synced += result.synced;
    total.conflicts += result.conflicts;
    total.failed += result.failed;
    if (result.attempted === 0) break;
  }
  return total;
}
