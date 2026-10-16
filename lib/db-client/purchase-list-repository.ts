import { newId } from "@/lib/domain/ids";
import type { PurchaseListRecord } from "@/lib/domain/entities";
import type { OutboxEntry } from "@/lib/domain/outbox";
import { nextOutboxSeq } from "@/lib/domain/outbox";
import type { OutboxRepository, PurchaseListRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";

/**
 * `PurchaseList` (Phase 2 §2.12) — optimistic concurrency via `version`
 * (Phase 2 §5). Unlike LWW, a local edit does NOT automatically win: the
 * outbox entry carries `baseVersion` (the version this edit was built
 * against), and the server rejects the write as a conflict if its stored
 * version has since moved past that — see `lib/sync/worker.ts` for how
 * the client reacts to a `conflict` response.
 */
export class DexiePurchaseListRepository implements PurchaseListRepository {
  constructor(
    private readonly db: MedTrackingDexie = getClientDb(),
    private readonly outbox: OutboxRepository = new DexieOutboxRepository(db),
  ) {}

  async list(profileId: string): Promise<PurchaseListRecord[]> {
    return this.db.purchaseList.where("profileId").equals(profileId).filter((r) => r.deletedAt === null).toArray();
  }

  async get(id: string): Promise<PurchaseListRecord | null> {
    const record = await this.db.purchaseList.get(id);
    return record ?? null;
  }

  async create(input: { id: string; profileId: string; name: string; clientMutationId: string }): Promise<PurchaseListRecord> {
    const now = new Date().toISOString();
    const record: PurchaseListRecord = {
      id: input.id,
      profileId: input.profileId,
      name: input.name,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      clientMutationId: input.clientMutationId,
      syncState: "pending",
    };

    const outboxEntry: OutboxEntry<PurchaseListRecord> = {
      clientMutationId: input.clientMutationId,
      entityType: "purchaseList",
      entityId: record.id,
      operation: "create",
      payload: record,
      baseVersion: undefined, // no prior version — this IS version 1
      createdAt: now,
      seq: nextOutboxSeq(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    };

    await this.db.transaction("rw", this.db.purchaseList, this.db.outbox, async () => {
      await this.db.purchaseList.add(record);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return record;
  }

  async rename(id: string, name: string, clientMutationId: string): Promise<PurchaseListRecord> {
    const now = new Date().toISOString();
    const existing = await this.db.purchaseList.get(id);
    if (!existing) {
      throw new Error(`Cannot rename purchase list ${id}: not found locally.`);
    }

    const baseVersion = existing.version;
    const updated: PurchaseListRecord = {
      ...existing,
      name,
      updatedAt: now,
      version: existing.version + 1, // optimistic local bump — the server is the real arbiter
      clientMutationId,
      syncState: "pending",
    };

    const outboxEntry: OutboxEntry<PurchaseListRecord> = {
      clientMutationId,
      entityType: "purchaseList",
      entityId: id,
      operation: "update",
      payload: updated,
      baseVersion,
      createdAt: now,
      seq: nextOutboxSeq(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    };

    await this.db.transaction("rw", this.db.purchaseList, this.db.outbox, async () => {
      await this.db.purchaseList.put(updated);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return updated;
  }

  /**
   * Deletes a list and everything on it (owner-reported 2026-10-17: lists
   * couldn't be deleted). One outbox entry for the list: the server deletes
   * its items in the same step and logs each, so they aren't sent one by
   * one. Here they're tombstoned with it, in one transaction, so nothing of
   * the list is left showing on this phone either, offline included.
   */
  async remove(id: string, clientMutationId: string): Promise<PurchaseListRecord> {
    const existing = await this.db.purchaseList.get(id);
    if (!existing) {
      throw new Error(`Cannot delete purchase list ${id}: not found locally.`);
    }

    const now = new Date().toISOString();
    const deleted: PurchaseListRecord = { ...existing, deletedAt: now, updatedAt: now, version: existing.version + 1, clientMutationId, syncState: "pending" };

    const outboxEntry: OutboxEntry<Record<string, never>> = {
      clientMutationId,
      entityType: "purchaseList",
      entityId: id,
      operation: "delete",
      profileId: existing.profileId,
      payload: {},
      // Not checked by the server: a deletion wins over a rename (`applyPurchaseListMutation`).
      baseVersion: existing.version,
      createdAt: now,
      seq: nextOutboxSeq(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    };

    await this.db.transaction("rw", this.db.purchaseList, this.db.purchaseListItem, this.db.outbox, async () => {
      await this.db.purchaseList.put(deleted);
      await this.db.purchaseListItem
        .where("purchaseListId")
        .equals(id)
        .filter((item) => item.deletedAt === null)
        .modify((item) => {
          item.deletedAt = now;
          item.updatedAt = now;
          item.version += 1;
        });
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return deleted;
  }

  async applyRemote(record: PurchaseListRecord): Promise<void> {
    await this.db.purchaseList.put({ ...record, syncState: "synced" });
  }

  async markConflict(id: string): Promise<void> {
    await this.db.purchaseList.update(id, { syncState: "conflict" });
  }

  async markFailed(id: string): Promise<void> {
    await this.db.purchaseList.update(id, { syncState: "failed" });
  }
}

/** Convenience factory mirroring the other repositories' default-constructor pattern. */
export function newLocalPurchaseListId(): string {
  return newId();
}
