import type { MedicationScheduleRecord, MedicationSchedulePatch, CreateMedicationScheduleInput } from "@/lib/domain/medication-schedule";
import { deriveTimeAnchor } from "@/lib/domain/medication-schedule";
import type { OutboxEntry } from "@/lib/domain/outbox";
import { nextOutboxSeq } from "@/lib/domain/outbox";
import type { MedicationScheduleRepository, OutboxRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";

/**
 * `MedicationSchedule` (Phase 2 §2.6, Phase 10) — optimistic concurrency,
 * same pattern as `DexieUserMedicationRepository`.
 */
export class DexieMedicationScheduleRepository implements MedicationScheduleRepository {
  constructor(
    private readonly db: MedTrackingDexie = getClientDb(),
    private readonly outbox: OutboxRepository = new DexieOutboxRepository(db),
  ) {}

  async list(profileId: string): Promise<MedicationScheduleRecord[]> {
    return this.db.medicationSchedule
      .where("profileId")
      .equals(profileId)
      .filter((r) => r.deletedAt === null)
      .toArray();
  }

  async listByUserMedication(userMedicationId: string): Promise<MedicationScheduleRecord[]> {
    return this.db.medicationSchedule
      .where("userMedicationId")
      .equals(userMedicationId)
      .filter((r) => r.deletedAt === null)
      .toArray();
  }

  async get(id: string): Promise<MedicationScheduleRecord | null> {
    const record = await this.db.medicationSchedule.get(id);
    return record ?? null;
  }

  async create(input: CreateMedicationScheduleInput): Promise<MedicationScheduleRecord> {
    const now = new Date().toISOString();
    const record: MedicationScheduleRecord = {
      ...input,
      timeAnchor: deriveTimeAnchor(input.scheduleKind),
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      syncState: "pending",
    };

    const outboxEntry: OutboxEntry<MedicationScheduleRecord> = {
      clientMutationId: input.clientMutationId,
      entityType: "medicationSchedule",
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

    await this.db.transaction("rw", this.db.medicationSchedule, this.db.outbox, async () => {
      await this.db.medicationSchedule.add(record);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return record;
  }

  async update(id: string, patch: MedicationSchedulePatch, clientMutationId: string): Promise<MedicationScheduleRecord> {
    const existing = await this.db.medicationSchedule.get(id);
    if (!existing) {
      throw new Error(`update: no local MedicationSchedule with id ${id}`);
    }

    const now = new Date().toISOString();
    const updated: MedicationScheduleRecord = { ...existing, ...patch, updatedAt: now, version: existing.version + 1, syncState: "pending" };

    const outboxEntry: OutboxEntry<MedicationSchedulePatch> = {
      clientMutationId,
      entityType: "medicationSchedule",
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

    await this.db.transaction("rw", this.db.medicationSchedule, this.db.outbox, async () => {
      await this.db.medicationSchedule.put(updated);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return updated;
  }

  async softDelete(id: string, clientMutationId: string): Promise<void> {
    const existing = await this.db.medicationSchedule.get(id);
    if (!existing) return;

    const now = new Date().toISOString();
    const outboxEntry: OutboxEntry<Record<string, never>> = {
      clientMutationId,
      entityType: "medicationSchedule",
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

    await this.db.transaction("rw", this.db.medicationSchedule, this.db.outbox, async () => {
      await this.db.medicationSchedule.update(id, { deletedAt: now, version: existing.version + 1, syncState: "pending" });
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });
  }

  async applyRemote(record: MedicationScheduleRecord): Promise<void> {
    await this.db.medicationSchedule.put({ ...record, syncState: "synced" });
  }

  async markConflict(id: string): Promise<void> {
    await this.db.medicationSchedule.update(id, { syncState: "conflict" });
  }

  async markFailed(id: string): Promise<void> {
    await this.db.medicationSchedule.update(id, { syncState: "failed" });
  }
}
