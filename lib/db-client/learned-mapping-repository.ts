import type { LearnedMappingRepository } from "@/lib/domain/repositories";
import type { LearnedGtinMapping } from "@/lib/domain/learned-mapping";
import { getClientDb, type LocalLearnedGtinMapping, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { getCachedProfileId } from "@/lib/auth/client/use-current-profile";

function toMapping(row: LocalLearnedGtinMapping): LearnedGtinMapping {
  return { gtin: row.gtin, catalogProductId: row.catalogProductId, evidenceType: row.evidenceType, confirmedAt: row.confirmedAt, syncedAt: row.syncedAt };
}

/**
 * Boxes the signed-in profile identified itself (OCR-fallback task spec
 * §15). Every read and write is the signed-in profile's own (2026-10-16):
 * another person signed in on the same phone neither gets these as matches
 * nor uploads them as theirs. Signed out, it holds nothing and saves nothing.
 */
export class DexieLearnedMappingRepository implements LearnedMappingRepository {
  constructor(
    private readonly db: MedTrackingDexie = getClientDb(),
    private readonly currentProfileId: () => string | null = getCachedProfileId,
  ) {}

  async getByGtin(gtin: string): Promise<LearnedGtinMapping | null> {
    const profileId = this.currentProfileId();
    if (!profileId) return null;
    const row = await this.db.learnedGtinMappingByProfile.get([profileId, gtin]);
    return row ? toMapping(row) : null;
  }

  async save(mapping: LearnedGtinMapping): Promise<{ overwroteDifferentProduct: boolean }> {
    const profileId = this.currentProfileId();
    if (!profileId) throw new Error("No profile signed in: a box identification belongs to one.");
    const existing = await this.db.learnedGtinMappingByProfile.get([profileId, mapping.gtin]);
    const overwroteDifferentProduct = Boolean(existing && existing.catalogProductId !== mapping.catalogProductId);
    await this.db.learnedGtinMappingByProfile.put({ ...mapping, profileId });
    return { overwroteDifferentProduct };
  }

  async listUnsynced(): Promise<LearnedGtinMapping[]> {
    const profileId = this.currentProfileId();
    if (!profileId) return [];
    // One row per box this profile identified: a small table, so a plain filter (see `dexie.ts`'s v5 note on `syncedAt`).
    const own = await this.db.learnedGtinMappingByProfile.where("profileId").equals(profileId).toArray();
    return own.filter((row) => row.syncedAt === null).map(toMapping);
  }

  async markSynced(gtin: string, syncedAt: string): Promise<void> {
    const profileId = this.currentProfileId();
    if (!profileId) return;
    await this.db.learnedGtinMappingByProfile.update([profileId, gtin], { syncedAt });
  }
}
