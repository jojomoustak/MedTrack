/**
 * Best-effort background sync of `learnedGtinMapping` rows to the server
 * (OCR-fallback task spec §16) — the "evaluate whether USER_CONFIRMED
 * mappings should sync to survive reinstall" question, answered here: yes,
 * but deliberately NOT via this project's full versioned outbox/
 * `sync_mutation` pipeline (`lib/domain/outbox.ts`,
 * `ENTITY_CONFLICT_STRATEGY`) — that machinery exists for mutable entities
 * needing optimistic-concurrency conflict detection (a `version` counter,
 * base-version comparison, LWW/merge strategies). A learned mapping is
 * append-only and idempotent-by-natural-key
 * (`uq_medication_identifier_user_confirmed_no_dupe`): confirming the same
 * GTIN→product pair twice is a no-op, and confirming a different product
 * for an already-confirmed GTIN is a NEW row (a conflict to preserve, not
 * a version to reconcile). Wiring a new `SyncEntityType` through the whole
 * versioned pipeline for a fact this simple would be a large, unjustified
 * addition of complexity for what this task actually needs — this module,
 * plus `confirmIdentifier`'s own idempotent `ON CONFLICT DO NOTHING`, is
 * the whole story: retry a plain POST for every row not yet confirmed
 * synced, mark it synced on success, leave it for the next tick on
 * failure. The local `learnedGtinMapping` row is ALWAYS the source of
 * truth for resolving a scan on this device regardless of `syncedAt`
 * (spec §15) — this module only affects durability across reinstall/new
 * device, never same-device resolution correctness.
 */
import type { LearnedMappingRepository } from "@/lib/domain/repositories";
import { DexieLearnedMappingRepository } from "@/lib/db-client/learned-mapping-repository";
import { confirmCatalogIdentifier } from "@/lib/catalog/client/api";
import type { NetworkState } from "@/lib/sync/client/network";
import { logger } from "@/lib/logging/logger";

export interface SyncLearnedMappingsOutcome {
  attempted: number;
  synced: number;
  failed: number;
}

export async function syncLearnedMappings(
  network: NetworkState,
  deps: { repository?: LearnedMappingRepository; fetchImpl?: typeof fetch } = {},
): Promise<SyncLearnedMappingsOutcome> {
  if (network !== "online") return { attempted: 0, synced: 0, failed: 0 };

  const repository = deps.repository ?? new DexieLearnedMappingRepository();
  const unsynced = await repository.listUnsynced();
  let synced = 0;
  let failed = 0;

  for (const mapping of unsynced) {
    try {
      await confirmCatalogIdentifier("GTIN", mapping.gtin, mapping.catalogProductId, deps.fetchImpl);
      await repository.markSynced(mapping.gtin, new Date().toISOString());
      synced++;
    } catch (err) {
      // Left with `syncedAt: null` — retried on the next reconnect/tick.
      // Never a fatal error for the caller: local resolution already works
      // regardless (module doc above).
      logger.warn("catalog.learned_mapping.sync_failed", { message: (err as Error).message });
      failed++;
    }
  }

  return { attempted: unsynced.length, synced, failed };
}
