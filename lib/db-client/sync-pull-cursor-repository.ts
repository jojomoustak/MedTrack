import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";

/**
 * The per-profile position in the server's change feed (`sync_change_log`
 * id) up to which this device has already applied changes. Lives in the
 * same IndexedDB database as the data it describes, so anything that wipes
 * the local data (sign-out, account deletion, the OS clearing app storage)
 * wipes the cursor with it and the next pull correctly starts from 0.
 */
export class DexieSyncPullCursorRepository {
  constructor(private readonly db: MedTrackingDexie = getClientDb()) {}

  async get(profileId: string): Promise<number> {
    const row = await this.db.syncPullCursor.get(profileId);
    return row?.cursor ?? 0;
  }

  async set(profileId: string, cursor: number): Promise<void> {
    await this.db.syncPullCursor.put({ profileId, cursor, updatedAt: new Date().toISOString() });
  }
}
