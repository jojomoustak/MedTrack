import { deriveFavoriteId, type FavoriteRecord } from "@/lib/domain/favorite";
import type { OutboxEntry } from "@/lib/domain/outbox";
import { nextOutboxSeq } from "@/lib/domain/outbox";
import type { FavoriteRepository, OutboxRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";

/**
 * `Favorite` (Phase 2 §2.10) — last-write-wins, same conflict-strategy
 * shape as `DexiePreferencesRepository`. `toggle` is the one write
 * operation: it always upserts the single row for (`profileId`,
 * `userMedicationId`) rather than exposing separate create/delete methods,
 * matching the schema's own "toggle-off tombstone, not a row delete" design
 * (`removedAt` flips; the row itself is never removed locally either).
 */
export class DexieFavoriteRepository implements FavoriteRepository {
  constructor(
    private readonly db: MedTrackingDexie = getClientDb(),
    private readonly outbox: OutboxRepository = new DexieOutboxRepository(db),
  ) {}

  async listActive(profileId: string): Promise<FavoriteRecord[]> {
    return this.db.favorite
      .where("profileId")
      .equals(profileId)
      .filter((r) => r.removedAt === null)
      .toArray();
  }

  async get(profileId: string, userMedicationId: string): Promise<FavoriteRecord | null> {
    const match = await this.db.favorite
      .where("userMedicationId")
      .equals(userMedicationId)
      .filter((r) => r.profileId === profileId)
      .first();
    return match ?? null;
  }

  async toggle(profileId: string, userMedicationId: string, clientMutationId: string): Promise<FavoriteRecord> {
    const now = new Date().toISOString();
    const existing = await this.get(profileId, userMedicationId);

    const updated: FavoriteRecord = existing
      ? {
          ...existing,
          removedAt: existing.removedAt === null ? now : null,
          clientUpdatedAt: now,
          clientMutationId,
          syncState: "pending",
        }
      : {
          // Deterministic, not random — see `deriveFavoriteId`'s doc for
          // the multi-device race this avoids.
          id: await deriveFavoriteId(profileId, userMedicationId),
          profileId,
          userMedicationId,
          createdAt: now,
          updatedAt: now,
          clientUpdatedAt: now,
          removedAt: null,
          clientMutationId,
          syncState: "pending",
        };

    const outboxEntry: OutboxEntry<FavoriteRecord> = {
      clientMutationId,
      entityType: "favorite",
      entityId: updated.id,
      operation: existing ? "update" : "create",
      payload: updated,
      baseVersion: undefined, // LWW, not optimistic concurrency — no version to carry.
      createdAt: now,
      seq: nextOutboxSeq(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    };

    await this.db.transaction("rw", this.db.favorite, this.db.outbox, async () => {
      await this.db.favorite.put(updated);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return updated;
  }

  async applyRemote(record: FavoriteRecord): Promise<void> {
    await this.db.favorite.put({ ...record, syncState: "synced" });
  }

  async markFailed(id: string): Promise<void> {
    await this.db.favorite.update(id, { syncState: "failed" });
  }
}
