import { newId } from "@/lib/domain/ids";
import { DEFAULT_USER_PREFERENCES, type UserPreferencesRecord } from "@/lib/domain/entities";
import type { OutboxEntry } from "@/lib/domain/outbox";
import type { OutboxRepository, UserPreferencesRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";

/**
 * `UserPreferences` (Phase 2 §2.3) — last-write-wins. A local edit always
 * wins locally (it's the user's own device, right now) and is always
 * queued for sync; the SERVER decides the eventual winner by comparing
 * `clientUpdatedAt` timestamps (Phase 2 §5) — the client doesn't need to
 * pre-resolve anything, which is exactly why LWW is the low-complexity
 * choice for this entity (Phase 1 §5).
 */
export class DexiePreferencesRepository implements UserPreferencesRepository {
  constructor(
    private readonly db: MedTrackingDexie = getClientDb(),
    private readonly outbox: OutboxRepository = new DexieOutboxRepository(db),
  ) {}

  async get(accountId: string): Promise<UserPreferencesRecord | null> {
    const record = await this.db.userPreferences.get(accountId);
    return record ?? null;
  }

  async update(
    accountId: string,
    patch: Partial<Pick<UserPreferencesRecord, "theme" | "language" | "reminderDefaultSnoozeMinutes" | "accessibilityTextScale">>,
  ): Promise<UserPreferencesRecord> {
    const now = new Date().toISOString();
    const existing = await this.db.userPreferences.get(accountId);
    const updated: UserPreferencesRecord = {
      ...(existing ?? { ...DEFAULT_USER_PREFERENCES, accountId, syncState: "local-only" as const }),
      ...patch,
      accountId,
      clientUpdatedAt: now,
      syncState: "pending",
    };

    const outboxEntry: OutboxEntry<UserPreferencesRecord> = {
      clientMutationId: newId(),
      entityType: "userPreferences",
      entityId: accountId,
      operation: "update",
      payload: updated,
      createdAt: now,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    };

    // Same local transaction, per the outbox pattern (designing-offline-sync).
    await this.db.transaction("rw", this.db.userPreferences, this.db.outbox, async () => {
      await this.db.userPreferences.put(updated);
      await this.db.outbox.put(outboxEntry as unknown as OutboxEntry);
    });

    return updated;
  }

  async applyRemote(record: UserPreferencesRecord): Promise<void> {
    await this.db.userPreferences.put({ ...record, syncState: "synced" });
  }
}
