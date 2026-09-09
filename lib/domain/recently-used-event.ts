/**
 * `RecentlyUsedEvent` (Phase 2 §2.11) — pure insert-only activity log
 * backing the Medications list's "Recent" segment (Phase 3 §1's
 * refinement, same relationship-not-copy framing as `Favorite`). No
 * update, no soft delete. Conflict strategy: idempotent-by-ID insert
 * (`ON CONFLICT (id) DO NOTHING`) — the same never-conflicts shape as a
 * schedule-generated `DoseEvent` create.
 *
 * Unbounded growth is a known, deliberately-deferred Phase 4 item (Phase 2
 * §2.11's own note) — a retention/aggregation job is an implementation
 * detail, not a schema requirement. This module doesn't add one; the
 * "Recent" list UI is expected to query with a `limit` (see
 * `RecentlyUsedEventRepository.listRecent`), not load the whole table.
 *
 * Deliberately no `clientMutationId` FIELD on this record — unlike every
 * other syncable entity, `recently_used_event` has no such column (Phase 2
 * §2.11's schema). Idempotency for a retried create is the client-
 * generated `id` itself (`ON CONFLICT (id) DO NOTHING`), not a
 * `clientMutationId` comparison; a `clientMutationId` is still generated
 * per write for the outer `sync_mutation` ledger (every mutation request
 * carries one, per the sync protocol), it's just never persisted onto this
 * particular entity's own row.
 */
import type { SyncableRecord } from "@/lib/domain/entities";

export const RECENTLY_USED_INTERACTION_TYPES = ["viewed", "marked_taken", "edited", "scanned"] as const;
export type RecentlyUsedInteractionType = (typeof RECENTLY_USED_INTERACTION_TYPES)[number];

export interface RecentlyUsedEventRecord extends SyncableRecord {
  id: string;
  profileId: string;
  userMedicationId: string;
  interactionType: RecentlyUsedInteractionType;
  occurredAt: string;
  createdAt: string;
}

export type CreateRecentlyUsedEventInput = Omit<RecentlyUsedEventRecord, "createdAt" | "syncState">;
