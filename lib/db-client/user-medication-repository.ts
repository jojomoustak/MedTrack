import type { UserMedicationPatch, UserMedicationRecord } from "@/lib/domain/user-medication";
import { updateUserMedicationSchema } from "@/lib/validation/user-medication";
import type { OutboxEntry } from "@/lib/domain/outbox";
import { nextOutboxSeq } from "@/lib/domain/outbox";
import type { CreateUserMedicationInput, OutboxRepository, UserMedicationRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";

/**
 * `UserMedication` (Phase 2 §2.5, ADR-004) — the third entity through the
 * Phase 5 outbox/sync pattern, and the first with an optional FK
 * (`catalogProductId`, set only when created from a catalog search
 * result — never merged into a copy, per ADR-004). Optimistic
 * concurrency, same mechanism as `PurchaseList` (Phase 2 §5).
 */
export class DexieUserMedicationRepository implements UserMedicationRepository {
  constructor(
    private readonly db: MedTrackingDexie = getClientDb(),
    private readonly outbox: OutboxRepository = new DexieOutboxRepository(db),
  ) {}

  async list(profileId: string): Promise<UserMedicationRecord[]> {
    return this.db.userMedication
      .where("profileId")
      .equals(profileId)
      .filter((r) => r.deletedAt === null)
      .toArray();
  }

  async get(id: string): Promise<UserMedicationRecord | null> {
    const record = await this.db.userMedication.get(id);
    return record ?? null;
  }

  async create(input: CreateUserMedicationInput): Promise<UserMedicationRecord> {
    const now = new Date().toISOString();
    const record: UserMedicationRecord = {
      id: input.id,
      profileId: input.profileId,
      catalogProductId: input.catalogProductId,
      customName: input.customName,
      customForm: input.customForm,
      customStrengthValue: input.customStrengthValue,
      customStrengthUnit: input.customStrengthUnit,
      treatmentState: "active",
      inventoryUnit: input.inventoryUnit,
      lowStockThresholdValue: input.lowStockThresholdValue,
      expiryWarningDays: input.expiryWarningDays,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
      clientMutationId: input.clientMutationId,
      syncState: "pending",
    };

    const outboxEntry: OutboxEntry<UserMedicationRecord> = {
      clientMutationId: input.clientMutationId,
      entityType: "userMedication",
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

    await this.db.transaction("rw", this.db.userMedication, this.db.outbox, async () => {
      await this.db.userMedication.add(record);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return record;
  }

  async update(id: string, patch: UserMedicationPatch, clientMutationId: string): Promise<UserMedicationRecord> {
    const parsed = updateUserMedicationSchema.parse(patch);
    const existing = await this.db.userMedication.get(id);
    if (!existing) {
      throw new Error(`update: no local UserMedication with id ${id}`);
    }

    const now = new Date().toISOString();
    const cleanedPatch: UserMedicationPatch = { ...parsed };
    for (const key of Object.keys(cleanedPatch) as (keyof typeof cleanedPatch)[]) {
      if (cleanedPatch[key] === undefined) delete cleanedPatch[key];
    }
    const updated: UserMedicationRecord = { ...existing, ...cleanedPatch, updatedAt: now, version: existing.version + 1, syncState: "pending" };

    const outboxEntry: OutboxEntry<UserMedicationPatch> = {
      clientMutationId,
      entityType: "userMedication",
      entityId: id,
      operation: "update",
      payload: cleanedPatch,
      baseVersion: existing.version,
      createdAt: now,
      seq: nextOutboxSeq(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    };

    await this.db.transaction("rw", this.db.userMedication, this.db.outbox, async () => {
      await this.db.userMedication.put(updated);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return updated;
  }

  async applyRemote(record: UserMedicationRecord): Promise<void> {
    await this.db.userMedication.put({ ...record, syncState: "synced" });
  }

  async markConflict(id: string): Promise<void> {
    await this.db.userMedication.update(id, { syncState: "conflict" });
  }

  async markFailed(id: string): Promise<void> {
    await this.db.userMedication.update(id, { syncState: "failed" });
  }
}
