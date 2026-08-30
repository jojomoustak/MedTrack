import type { OutboxEntry } from "@/lib/domain/outbox";
import type { OutboxRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";

export class DexieOutboxRepository implements OutboxRepository {
  constructor(private readonly db: MedTrackingDexie = getClientDb()) {}

  async enqueue(entry: OutboxEntry): Promise<void> {
    await this.db.outbox.put(entry);
  }

  /**
   * Entries ready for a (re)send attempt: `pending` (never tried, or
   * backoff elapsed after a `failed` attempt) or `failed` whose backoff
   * window has passed — `syncing` (already in flight) is excluded. A
   * `failed` outbox entry keeps auto-retrying in the background (Phase 3
   * §5's "tap to retry" is an ADDITIONAL manual affordance, not a
   * requirement that background retry stop) — the persistent `failed`
   * chip is driven by the entity's own `syncState`, not by this method
   * refusing to retry.
   *
   * Ordered by `seq` ascending (falling back to `createdAt` when `seq` is
   * missing — pre-existing installs' already-stored `failed` entries) — a
   * real bug found via live-device testing (2026-08-30, Phase 10): with no
   * explicit order, Dexie's `.toArray()` iterates in primary-key order,
   * and `clientMutationId` (the primary key) is a random UUID, so a batch
   * could send a DoseEvent's create BEFORE its own just-created
   * MedicationSchedule's create within the SAME request. The server
   * processes a batch sequentially (`applyMutations`'s for-loop) but
   * doesn't currently isolate one mutation's failure from the rest of the
   * batch, so the dose event's foreign-key violation (`schedule_id` not
   * found yet) aborted the whole request — every entry in the batch,
   * including the schedule itself, came back marked `failed`, even once
   * the schedule genuinely had succeeded. An initial fix sorted by
   * `createdAt` (a wall-clock string) instead, which matches local
   * creation order in general — but a follow-up live-device test caught
   * that `createdAt`'s millisecond resolution isn't fine enough for the
   * real `AddMedicationFlow` shape (a schedule immediately followed by
   * several generated dose events, easily colliding on the same
   * millisecond), which silently degraded the sort back to the same
   * random primary-key order for those ties. `seq` (`nextOutboxSeq()`) is
   * a locally-assigned strictly-increasing counter with no such collision.
   */
  async listPending(now: string): Promise<OutboxEntry[]> {
    const entries = await this.db.outbox.where("status").notEqual("syncing").toArray();
    return entries.filter((e) => e.nextAttemptAt <= now).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.createdAt.localeCompare(b.createdAt));
  }

  async markSyncing(clientMutationId: string): Promise<void> {
    await this.db.outbox.update(clientMutationId, { status: "syncing" });
  }

  async markSynced(clientMutationId: string): Promise<void> {
    await this.db.outbox.delete(clientMutationId);
  }

  async markFailed(clientMutationId: string, error: string, nextAttemptAt: string): Promise<void> {
    const existing = await this.db.outbox.get(clientMutationId);
    await this.db.outbox.update(clientMutationId, {
      status: "failed",
      lastError: error,
      nextAttemptAt,
      attempts: (existing?.attempts ?? 0) + 1,
    });
  }

  async remove(clientMutationId: string): Promise<void> {
    await this.db.outbox.delete(clientMutationId);
  }

  async listForEntity(entityId: string): Promise<OutboxEntry[]> {
    return this.db.outbox.where("entityId").equals(entityId).toArray();
  }
}
