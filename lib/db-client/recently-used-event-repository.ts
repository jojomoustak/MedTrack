import { newId } from "@/lib/domain/ids";
import type { CreateRecentlyUsedEventInput, RecentlyUsedEventRecord } from "@/lib/domain/recently-used-event";
import type { OutboxEntry } from "@/lib/domain/outbox";
import { nextOutboxSeq } from "@/lib/domain/outbox";
import type { OutboxRepository, RecentlyUsedEventRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";

/**
 * `RecentlyUsedEvent` (Phase 2 §2.11) — idempotent-by-id, pure insert-only.
 * `record()` always uses `add()`'s natural client-generated-id uniqueness
 * rather than a `get`-then-`put` check first: a retried call reuses the
 * SAME `id` (the caller decides the id, same convention as a schedule-
 * generated `DoseEvent`), so a `ConstraintError` on retry is expected and
 * harmless — see this method's own try/catch.
 */
export class DexieRecentlyUsedEventRepository implements RecentlyUsedEventRepository {
  constructor(
    private readonly db: MedTrackingDexie = getClientDb(),
    private readonly outbox: OutboxRepository = new DexieOutboxRepository(db),
  ) {}

  async listRecent(profileId: string, limit: number): Promise<RecentlyUsedEventRecord[]> {
    return this.db.recentlyUsedEvent
      .where("profileId")
      .equals(profileId)
      .reverse()
      .sortBy("occurredAt")
      .then((rows) => rows.slice(0, limit));
  }

  async record(input: CreateRecentlyUsedEventInput): Promise<RecentlyUsedEventRecord> {
    const existing = await this.db.recentlyUsedEvent.get(input.id);
    if (existing) return existing;

    const now = new Date().toISOString();
    const record: RecentlyUsedEventRecord = {
      ...input,
      createdAt: now,
      syncState: "pending",
    };

    // A fresh `clientMutationId` per write for the outbox/`sync_mutation`
    // ledger only — never persisted onto the entity row itself (see the
    // domain module's doc for why this entity has no such column).
    const outboxEntry: OutboxEntry<RecentlyUsedEventRecord> = {
      clientMutationId: newId(),
      entityType: "recentlyUsedEvent",
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

    // `put`, not `add`: same race-with-a-pulled-remote-create reasoning as
    // `DexieDoseEventRepository.createIfMissing` — a `put` on an existing
    // key is a harmless no-op re-check, not a thrown `ConstraintError`.
    await this.db.transaction("rw", this.db.recentlyUsedEvent, this.db.outbox, async () => {
      const raceCheck = await this.db.recentlyUsedEvent.get(input.id);
      if (raceCheck) return;
      await this.db.recentlyUsedEvent.put(record);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return (await this.db.recentlyUsedEvent.get(input.id)) ?? record;
  }

  async applyRemote(record: RecentlyUsedEventRecord): Promise<void> {
    await this.db.recentlyUsedEvent.put({ ...record, syncState: "synced" });
  }

  async markFailed(id: string): Promise<void> {
    await this.db.recentlyUsedEvent.update(id, { syncState: "failed" });
  }
}
