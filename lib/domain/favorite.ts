/**
 * `Favorite` (Phase 2 §2.10) — a relationship on `UserMedication`, not a
 * copy of it, and distinct from `treatmentState` (Phase 3 §1's refinement:
 * modeled as a segmented filter on the Medications list, not a separate
 * tab/inventory of content). Conflict strategy: last-write-wins on
 * `clientUpdatedAt` — a lost concurrent favorite-toggle has no safety/
 * integrity consequence, same reasoning as `UserPreferencesRecord`.
 *
 * `removedAt` is a **toggle-off tombstone, not a row delete** (Phase 2 §2.10's
 * own schema comment): the `UNIQUE(profileId, userMedicationId)` constraint
 * means re-favoriting the same medication reuses the SAME row (setting
 * `removedAt` back to `null`) rather than ever creating a second one — this
 * is what lets two devices toggling the same favorite concurrently converge
 * cleanly via LWW, with no unique-constraint race to recover from.
 */
import type { SyncableRecord } from "@/lib/domain/entities";
import { uuidV5 } from "@/lib/domain/dose-event-generation";

/**
 * Fixed, NEVER-changed namespace for a `Favorite`'s deterministic id — see
 * `deriveFavoriteId`'s doc for why this needs to be deterministic at all.
 * Same "treat as immutable as a column name" rule as
 * `dose-event-generation.ts`'s `SCHEDULE_GENERATED_NAMESPACE`.
 */
const FAVORITE_ID_NAMESPACE = "8a1c6e2d-4b7f-4e3a-9c5d-1f2b3a4c5d6e";

/**
 * A `Favorite` row's `id` is deterministic — derived from the one pair
 * that's actually unique (`profileId`, `userMedicationId`), not random
 * (`newId()`). Why: `favorite` has BOTH a primary-key `id` AND a separate
 * `UNIQUE(profileId, userMedicationId)` constraint (Phase 2 §2.10). If two
 * devices independently favorite the same medication for the first time
 * before either has synced, a random `id` on each device means the LOSING
 * device's local row — the one whose `id` didn't win the server's `ON
 * CONFLICT` merge — would be left orphaned locally under a stale id the
 * server never returns back. A deterministic id sidesteps the whole race:
 * both devices compute the IDENTICAL id for the identical pair, so the
 * server's upsert can key on `id` alone and there is nothing to reconcile
 * afterward — the exact same reasoning `deriveScheduledDoseEventId` uses
 * for schedule-generated `DoseEvent` rows.
 */
export async function deriveFavoriteId(profileId: string, userMedicationId: string): Promise<string> {
  return uuidV5(FAVORITE_ID_NAMESPACE, `${profileId}|${userMedicationId}`);
}

export interface FavoriteRecord extends SyncableRecord {
  id: string;
  profileId: string;
  userMedicationId: string;
  createdAt: string;
  /** Server-set, authoritative for ordering once synced. */
  updatedAt: string;
  /** Device clock — the actual LWW comparator. */
  clientUpdatedAt: string | null;
  /** `null` when currently favorited; set when toggled off. */
  removedAt: string | null;
  clientMutationId: string;
}
