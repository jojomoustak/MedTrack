import type { CreateInventoryTransactionInput, InventoryTransactionRecord } from "@/lib/domain/inventory-transaction";
import type { OutboxEntry } from "@/lib/domain/outbox";
import { nextOutboxSeq } from "@/lib/domain/outbox";
import type { InventoryTransactionRepository, OutboxRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";

/**
 * `MedicationInventoryTransaction` — the append-only ledger (Phase 2
 * §2.9, ADR-010, Phase 9). Idempotent-by-id, same pattern as
 * `DexieDoseEventRepository`: no `update`/`softDelete` (a ledger row is
 * never edited or removed — a correction is a new offsetting row), no
 * `markConflict` (the server never returns `"conflict"` for this entity).
 */
export class DexieInventoryTransactionRepository implements InventoryTransactionRepository {
  constructor(
    private readonly db: MedTrackingDexie = getClientDb(),
    private readonly outbox: OutboxRepository = new DexieOutboxRepository(db),
  ) {}

  async listByUserMedication(userMedicationId: string): Promise<InventoryTransactionRecord[]> {
    return this.db.inventoryTransaction.where("userMedicationId").equals(userMedicationId).toArray();
  }

  async listForProfile(profileId: string): Promise<InventoryTransactionRecord[]> {
    return this.db.inventoryTransaction.where("profileId").equals(profileId).toArray();
  }

  async createIfMissing(input: CreateInventoryTransactionInput): Promise<InventoryTransactionRecord> {
    const existing = await this.db.inventoryTransaction.get(input.id);
    if (existing) return existing;

    const now = new Date().toISOString();
    const record: InventoryTransactionRecord = {
      ...input,
      recordedAt: now,
      syncState: "pending",
    };

    const outboxEntry: OutboxEntry<InventoryTransactionRecord> = {
      clientMutationId: input.clientMutationId,
      entityType: "medicationInventoryTransaction",
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

    // `put`, not `add`: same race-tolerance reasoning as
    // `DexieDoseEventRepository.createIfMissing` — a locally-computed
    // ledger row (e.g. from `buildDoseTakenConsumption`) may legitimately
    // race a pulled `applyRemote` for the SAME id (another device wrote
    // this exact dose_taken transaction first).
    await this.db.transaction("rw", this.db.inventoryTransaction, this.db.outbox, async () => {
      const raceCheck = await this.db.inventoryTransaction.get(input.id);
      if (raceCheck) return;
      await this.db.inventoryTransaction.put(record);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return (await this.db.inventoryTransaction.get(input.id)) ?? record;
  }

  async applyRemote(record: InventoryTransactionRecord): Promise<void> {
    await this.db.inventoryTransaction.put({ ...record, syncState: "synced" });
  }

  async markFailed(id: string): Promise<void> {
    await this.db.inventoryTransaction.update(id, { syncState: "failed" });
  }
}
