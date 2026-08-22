import type { SaveUnresolvedScanInput, UnresolvedScanRecord, UnresolvedScanRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";

/**
 * Local-only store for scans that couldn't be identified while offline
 * (Phase 1 §7 / Phase 3 §4) — see `UnresolvedScanRecord`'s doc comment for
 * why this never goes through the outbox.
 */
export class DexieUnresolvedScanRepository implements UnresolvedScanRepository {
  constructor(private readonly db: MedTrackingDexie = getClientDb()) {}

  async save(input: SaveUnresolvedScanInput): Promise<void> {
    const record: UnresolvedScanRecord = {
      ...input,
      scannedAt: new Date().toISOString(),
      resolvedAt: null,
    };
    await this.db.unresolvedScan.put(record);
  }

  async listPending(profileId: string): Promise<UnresolvedScanRecord[]> {
    return this.db.unresolvedScan
      .where("profileId")
      .equals(profileId)
      .filter((r) => r.resolvedAt === null)
      .toArray();
  }
}
