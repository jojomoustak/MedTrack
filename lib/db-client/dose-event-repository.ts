import type { CreateDoseEventInput, DoseEventRecord, DoseEventTransitionPatch } from "@/lib/domain/dose-event";
import { isTerminalDoseEventStatus } from "@/lib/domain/dose-event";
import type { OutboxEntry } from "@/lib/domain/outbox";
import { nextOutboxSeq } from "@/lib/domain/outbox";
import type { DoseEventRepository, OutboxRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";

/**
 * `DoseEvent` (Phase 2 §2.7, Phase 10) — idempotent-by-id, never
 * optimistic concurrency (`designing-offline-sync`). No `markConflict`:
 * the server never returns `"conflict"` for this entity — a losing local
 * transition is silently superseded by whatever `serverRecord` comes
 * back instead (`lib/sync/client/apply-result.ts`).
 */
export class DexieDoseEventRepository implements DoseEventRepository {
  constructor(
    private readonly db: MedTrackingDexie = getClientDb(),
    private readonly outbox: OutboxRepository = new DexieOutboxRepository(db),
  ) {}

  async listForProfileInRange(profileId: string, fromIso: string, toIso: string): Promise<DoseEventRecord[]> {
    return this.db.doseEvent
      .where("profileId")
      .equals(profileId)
      .filter((r) => r.scheduledAt !== null && r.scheduledAt >= fromIso && r.scheduledAt <= toIso)
      .toArray();
  }

  async listByUserMedication(userMedicationId: string): Promise<DoseEventRecord[]> {
    return this.db.doseEvent.where("userMedicationId").equals(userMedicationId).toArray();
  }

  async listByScheduleId(scheduleId: string): Promise<DoseEventRecord[]> {
    return this.db.doseEvent.where("scheduleId").equals(scheduleId).toArray();
  }

  async listNonTerminalBefore(profileId: string, cutoffIso: string): Promise<DoseEventRecord[]> {
    return this.db.doseEvent
      .where("profileId")
      .equals(profileId)
      .filter((r) => !isTerminalDoseEventStatus(r.status) && r.scheduledAt !== null && r.scheduledAt < cutoffIso)
      .toArray();
  }

  async get(id: string): Promise<DoseEventRecord | null> {
    const record = await this.db.doseEvent.get(id);
    return record ?? null;
  }

  async createIfMissing(input: CreateDoseEventInput): Promise<DoseEventRecord> {
    const existing = await this.db.doseEvent.get(input.id);
    if (existing) return existing;

    const now = new Date().toISOString();
    const record: DoseEventRecord = {
      ...input,
      status: "scheduled",
      takenAt: null,
      snoozeCount: 0,
      createdAt: now,
      updatedAt: now,
      syncState: "pending",
    };

    const outboxEntry: OutboxEntry<DoseEventRecord> = {
      clientMutationId: input.clientMutationId,
      entityType: "doseEvent",
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

    // `put`, not `add`: generation may legitimately race a pulled
    // `applyRemote` for the SAME deterministic id (another device
    // generated and synced this instant first) — a `put` on an existing
    // key just re-checks `existing` above and returns early, but between
    // that read and this write another writer could still have landed;
    // `put` (upsert) makes that race harmless instead of throwing
    // Dexie's ConstraintError the way `add` would.
    await this.db.transaction("rw", this.db.doseEvent, this.db.outbox, async () => {
      const raceCheck = await this.db.doseEvent.get(input.id);
      if (raceCheck) return;
      await this.db.doseEvent.put(record);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return (await this.db.doseEvent.get(input.id)) ?? record;
  }

  async transition(id: string, patch: DoseEventTransitionPatch, clientMutationId: string): Promise<DoseEventRecord> {
    const existing = await this.db.doseEvent.get(id);
    if (!existing) {
      throw new Error(`transition: no local DoseEvent with id ${id}`);
    }
    if (isTerminalDoseEventStatus(existing.status)) {
      // Mirrors the server's own guard (lib/sync/server/mutations.ts) —
      // a stale action-sheet tap on an already-terminal dose can't even
      // produce a pointless network round trip.
      throw new Error(`transition: DoseEvent ${id} is already terminal (${existing.status})`);
    }

    const now = new Date().toISOString();
    const updated: DoseEventRecord = {
      ...existing,
      status: patch.status,
      takenAt: patch.takenAt ?? existing.takenAt,
      quantityValue: patch.quantityValue ?? existing.quantityValue,
      quantityUnit: patch.quantityUnit ?? existing.quantityUnit,
      snoozeCount: patch.status === "snoozed" ? existing.snoozeCount + 1 : existing.snoozeCount,
      updatedAt: now,
      syncState: "pending",
    };

    const outboxEntry: OutboxEntry<DoseEventTransitionPatch> = {
      clientMutationId,
      entityType: "doseEvent",
      entityId: id,
      operation: "update",
      payload: patch,
      baseVersion: undefined,
      createdAt: now,
      seq: nextOutboxSeq(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    };

    await this.db.transaction("rw", this.db.doseEvent, this.db.outbox, async () => {
      await this.db.doseEvent.put(updated);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return updated;
  }

  async applyRemote(record: DoseEventRecord): Promise<void> {
    const existing = await this.db.doseEvent.get(record.id);
    // A losing local transition converges to the server's authoritative
    // row (designing-offline-sync: "converge, not conflict") — but never
    // regress a local row that's already MORE final than what just came
    // back (e.g. a local 'skipped' shouldn't revert to 'scheduled' from
    // a stale pulled row that predates this device's own not-yet-synced
    // write landing).
    if (existing && isTerminalDoseEventStatus(existing.status) && !isTerminalDoseEventStatus(record.status)) {
      await this.db.doseEvent.update(record.id, { syncState: "synced" });
      return;
    }
    await this.db.doseEvent.put({ ...record, syncState: "synced" });
  }

  async markFailed(id: string): Promise<void> {
    await this.db.doseEvent.update(id, { syncState: "failed" });
  }
}
