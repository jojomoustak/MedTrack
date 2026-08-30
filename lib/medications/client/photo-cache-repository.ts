import type { PhotoCacheEntry, PhotoCacheRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";

/**
 * Recommended by the offline-photo design (2026-08-29): the max photo
 * size is 8MB (`MAX_MEDICATION_PHOTO_BYTES`, no client-side resize
 * exists today), so this comfortably fits a handful of full-size photos
 * before eviction kicks in without risking the cache itself becoming a
 * meaningful contributor to the storage pressure it's meant to tolerate.
 */
const MAX_CACHE_BYTES = 40 * 1024 * 1024;
/** Mostly a backstop against a pathological many-small-photos case — the byte budget above is the primary limit in practice. */
const MAX_CACHE_ENTRIES = 30;

export class DexiePhotoCacheRepository implements PhotoCacheRepository {
  constructor(private readonly db: MedTrackingDexie = getClientDb()) {}

  async get(userMedicationId: string): Promise<PhotoCacheEntry | null> {
    const row = await this.db.medicationPhotoCache.get(userMedicationId);
    if (!row) return null;
    return { userMedicationId: row.userMedicationId, blob: row.blob, contentType: row.contentType };
  }

  async touch(userMedicationId: string): Promise<void> {
    await this.db.medicationPhotoCache.update(userMedicationId, { lastViewedAt: new Date().toISOString() });
  }

  async put(entry: PhotoCacheEntry): Promise<void> {
    const now = new Date().toISOString();
    await this.db.medicationPhotoCache.put({
      userMedicationId: entry.userMedicationId,
      blob: entry.blob,
      contentType: entry.contentType,
      byteSize: entry.blob.size,
      cachedAt: now,
      lastViewedAt: now,
    });
    await this.enforceBudget();
  }

  async remove(userMedicationId: string): Promise<void> {
    await this.db.medicationPhotoCache.delete(userMedicationId);
  }

  /** Evicts least-recently-viewed entries until both caps are satisfied. Cheap in practice — this table only ever holds a handful of rows. */
  private async enforceBudget(): Promise<void> {
    const rows = await this.db.medicationPhotoCache.orderBy("lastViewedAt").toArray();
    let totalBytes = rows.reduce((sum, row) => sum + row.byteSize, 0);
    let count = rows.length;

    const toEvict: string[] = [];
    for (const row of rows) {
      if (count <= MAX_CACHE_ENTRIES && totalBytes <= MAX_CACHE_BYTES) break;
      toEvict.push(row.userMedicationId);
      totalBytes -= row.byteSize;
      count -= 1;
    }

    if (toEvict.length > 0) {
      await this.db.medicationPhotoCache.bulkDelete(toEvict);
    }
  }
}
