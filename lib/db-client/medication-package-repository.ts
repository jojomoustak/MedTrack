import type { MedicationPackageRecord, MedicationPackagePatch, CreateMedicationPackageInput } from "@/lib/domain/medication-package";
import type { OutboxEntry } from "@/lib/domain/outbox";
import { nextOutboxSeq } from "@/lib/domain/outbox";
import type { MedicationPackageRepository, OutboxRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";

/**
 * `MedicationPackage` (Phase 2 §2.8, Phase 9) — optimistic concurrency,
 * same pattern as `DexieMedicationScheduleRepository`. Always creates
 * `status: "unopened"` — the domain layer (`lib/domain/inventory-consumption.ts`
 * and its call sites), never a client-asserted field, decides when a
 * package transitions to `"opened"`.
 */
export class DexieMedicationPackageRepository implements MedicationPackageRepository {
  constructor(
    private readonly db: MedTrackingDexie = getClientDb(),
    private readonly outbox: OutboxRepository = new DexieOutboxRepository(db),
  ) {}

  async listByUserMedication(userMedicationId: string): Promise<MedicationPackageRecord[]> {
    return this.db.medicationPackage
      .where("userMedicationId")
      .equals(userMedicationId)
      .filter((r) => r.deletedAt === null)
      .toArray();
  }

  async get(id: string): Promise<MedicationPackageRecord | null> {
    const record = await this.db.medicationPackage.get(id);
    return record ?? null;
  }

  async create(input: CreateMedicationPackageInput): Promise<MedicationPackageRecord> {
    const now = new Date().toISOString();
    const record: MedicationPackageRecord = {
      ...input,
      status: "unopened",
      openedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      syncState: "pending",
    };

    const outboxEntry: OutboxEntry<MedicationPackageRecord> = {
      clientMutationId: input.clientMutationId,
      entityType: "medicationPackage",
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

    await this.db.transaction("rw", this.db.medicationPackage, this.db.outbox, async () => {
      await this.db.medicationPackage.add(record);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return record;
  }

  async update(id: string, patch: MedicationPackagePatch, clientMutationId: string): Promise<MedicationPackageRecord> {
    const existing = await this.db.medicationPackage.get(id);
    if (!existing) {
      throw new Error(`update: no local MedicationPackage with id ${id}`);
    }

    const now = new Date().toISOString();
    const updated: MedicationPackageRecord = { ...existing, ...patch, updatedAt: now, version: existing.version + 1, syncState: "pending" };

    const outboxEntry: OutboxEntry<MedicationPackagePatch> = {
      clientMutationId,
      entityType: "medicationPackage",
      entityId: id,
      operation: "update",
      payload: patch,
      baseVersion: existing.version,
      createdAt: now,
      seq: nextOutboxSeq(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    };

    await this.db.transaction("rw", this.db.medicationPackage, this.db.outbox, async () => {
      await this.db.medicationPackage.put(updated);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return updated;
  }

  async softDelete(id: string, clientMutationId: string): Promise<void> {
    const existing = await this.db.medicationPackage.get(id);
    if (!existing) return;

    const now = new Date().toISOString();
    const outboxEntry: OutboxEntry<Record<string, never>> = {
      clientMutationId,
      entityType: "medicationPackage",
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

    await this.db.transaction("rw", this.db.medicationPackage, this.db.outbox, async () => {
      await this.db.medicationPackage.update(id, { deletedAt: now, version: existing.version + 1, syncState: "pending" });
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });
  }

  async applyRemote(record: MedicationPackageRecord): Promise<void> {
    await this.db.medicationPackage.put({ ...record, syncState: "synced" });
  }

  async markConflict(id: string): Promise<void> {
    await this.db.medicationPackage.update(id, { syncState: "conflict" });
  }

  async markFailed(id: string): Promise<void> {
    await this.db.medicationPackage.update(id, { syncState: "failed" });
  }
}
