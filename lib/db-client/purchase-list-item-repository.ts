import type { PurchaseListItemRecord } from "@/lib/domain/entities";
import type { OutboxEntry } from "@/lib/domain/outbox";
import { nextOutboxSeq } from "@/lib/domain/outbox";
import type { OutboxRepository, PurchaseListItemRepository } from "@/lib/domain/repositories";
import { createPurchaseListItemSchema, updatePurchaseListItemSchema, type CreatePurchaseListItemInput, type UpdatePurchaseListItemInput } from "@/lib/validation/purchase-list-item";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";

/**
 * `PurchaseListItem` (Phase 2 §2.12, Phase 13) — optimistic concurrency
 * via `version`, same pattern as `DexieMedicationPackageRepository`: an
 * update's outbox payload is the PARTIAL patch (not the full record), so
 * the server can tell "not sent, keep existing" apart from "sent as null,
 * clear it" (`lib/sync/server/mutations.ts`'s `applyPurchaseListItemMutation`).
 */
export class DexiePurchaseListItemRepository implements PurchaseListItemRepository {
  constructor(
    private readonly db: MedTrackingDexie = getClientDb(),
    private readonly outbox: OutboxRepository = new DexieOutboxRepository(db),
  ) {}

  async listByPurchaseList(purchaseListId: string): Promise<PurchaseListItemRecord[]> {
    return this.db.purchaseListItem
      .where("purchaseListId")
      .equals(purchaseListId)
      .filter((r) => r.deletedAt === null)
      .sortBy("createdAt");
  }

  async get(id: string): Promise<PurchaseListItemRecord | null> {
    const record = await this.db.purchaseListItem.get(id);
    return record ?? null;
  }

  async create(input: CreatePurchaseListItemInput & { profileId: string }): Promise<PurchaseListItemRecord> {
    const parsed = createPurchaseListItemSchema.parse(input);
    const now = new Date().toISOString();
    const record: PurchaseListItemRecord = {
      id: parsed.id,
      purchaseListId: parsed.purchaseListId,
      profileId: input.profileId,
      userMedicationId: parsed.userMedicationId ?? null,
      label: parsed.label ?? null,
      quantityValue: parsed.quantityValue !== undefined && parsed.quantityValue !== null ? String(parsed.quantityValue) : null,
      quantityUnit: parsed.quantityUnit ?? null,
      estimatedUnitPriceCents: parsed.estimatedUnitPriceCents ?? null,
      actualPaidPriceCents: null,
      currency: parsed.currency ?? "EUR",
      status: "pending",
      purchasedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      clientMutationId: parsed.clientMutationId,
      syncState: "pending",
    };

    const outboxEntry: OutboxEntry<PurchaseListItemRecord> = {
      clientMutationId: parsed.clientMutationId,
      entityType: "purchaseListItem",
      entityId: record.id,
      operation: "create",
      payload: record,
      baseVersion: undefined,
      createdAt: now,
      seq: nextOutboxSeq(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    };

    await this.db.transaction("rw", this.db.purchaseListItem, this.db.outbox, async () => {
      await this.db.purchaseListItem.add(record);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return record;
  }

  async update(id: string, patch: UpdatePurchaseListItemInput, clientMutationId: string): Promise<PurchaseListItemRecord> {
    const parsed = updatePurchaseListItemSchema.parse(patch);
    const existing = await this.db.purchaseListItem.get(id);
    if (!existing) {
      throw new Error(`update: no local PurchaseListItem with id ${id}`);
    }

    const now = new Date().toISOString();
    const localPatch: Partial<PurchaseListItemRecord> = {
      ...parsed,
      quantityValue: parsed.quantityValue !== undefined ? (parsed.quantityValue !== null ? String(parsed.quantityValue) : null) : undefined,
    };
    // Drop `undefined` entries so `{ ...existing, ...localPatch }` below only overwrites fields actually present in the patch.
    for (const key of Object.keys(localPatch) as (keyof typeof localPatch)[]) {
      if (localPatch[key] === undefined) delete localPatch[key];
    }

    const updated: PurchaseListItemRecord = { ...existing, ...localPatch, updatedAt: now, version: existing.version + 1, syncState: "pending" };

    const outboxEntry: OutboxEntry<UpdatePurchaseListItemInput> = {
      clientMutationId,
      entityType: "purchaseListItem",
      entityId: id,
      operation: "update",
      payload: parsed,
      baseVersion: existing.version,
      createdAt: now,
      seq: nextOutboxSeq(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    };

    await this.db.transaction("rw", this.db.purchaseListItem, this.db.outbox, async () => {
      await this.db.purchaseListItem.put(updated);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return updated;
  }

  async remove(id: string, clientMutationId: string): Promise<PurchaseListItemRecord> {
    const existing = await this.db.purchaseListItem.get(id);
    if (!existing) {
      throw new Error(`remove: no local PurchaseListItem with id ${id}`);
    }

    const now = new Date().toISOString();
    const updated: PurchaseListItemRecord = { ...existing, deletedAt: now, updatedAt: now, version: existing.version + 1, syncState: "pending" };

    const outboxEntry: OutboxEntry<Record<string, never>> = {
      clientMutationId,
      entityType: "purchaseListItem",
      entityId: id,
      operation: "delete",
      payload: {},
      baseVersion: existing.version,
      createdAt: now,
      seq: nextOutboxSeq(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    };

    await this.db.transaction("rw", this.db.purchaseListItem, this.db.outbox, async () => {
      await this.db.purchaseListItem.put(updated);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return updated;
  }

  async applyRemote(record: PurchaseListItemRecord): Promise<void> {
    await this.db.purchaseListItem.put({ ...record, syncState: "synced" });
  }

  async markConflict(id: string): Promise<void> {
    await this.db.purchaseListItem.update(id, { syncState: "conflict" });
  }

  async markFailed(id: string): Promise<void> {
    await this.db.purchaseListItem.update(id, { syncState: "failed" });
  }
}
