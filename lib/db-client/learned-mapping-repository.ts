import type { LearnedMappingRepository } from "@/lib/domain/repositories";
import type { LearnedGtinMapping } from "@/lib/domain/learned-mapping";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";

export class DexieLearnedMappingRepository implements LearnedMappingRepository {
  constructor(private readonly db: MedTrackingDexie = getClientDb()) {}

  async getByGtin(gtin: string): Promise<LearnedGtinMapping | null> {
    const row = await this.db.learnedGtinMapping.get(gtin);
    return row ?? null;
  }

  async save(mapping: LearnedGtinMapping): Promise<{ overwroteDifferentProduct: boolean }> {
    const existing = await this.db.learnedGtinMapping.get(mapping.gtin);
    const overwroteDifferentProduct = Boolean(existing && existing.catalogProductId !== mapping.catalogProductId);
    await this.db.learnedGtinMapping.put(mapping);
    return { overwroteDifferentProduct };
  }

  async listUnsynced(): Promise<LearnedGtinMapping[]> {
    // Plain in-memory filter, not an indexed query — see `dexie.ts`'s v5
    // doc comment for why `syncedAt` isn't (and can't cleanly be) a Dexie
    // index: this table is small (one row per medicine a user has
    // personally confirmed), so a full-table scan is trivial.
    const all = await this.db.learnedGtinMapping.toArray();
    return all.filter((row) => row.syncedAt === null);
  }

  async markSynced(gtin: string, syncedAt: string): Promise<void> {
    await this.db.learnedGtinMapping.update(gtin, { syncedAt });
  }
}
