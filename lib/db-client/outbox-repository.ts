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
   */
  async listPending(now: string): Promise<OutboxEntry[]> {
    const entries = await this.db.outbox.where("status").notEqual("syncing").toArray();
    return entries.filter((e) => e.nextAttemptAt <= now);
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
