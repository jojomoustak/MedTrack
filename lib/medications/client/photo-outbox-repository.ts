import type { PhotoOutboxEnqueueInput, PhotoOutboxOperation, PhotoOutboxRepository } from "@/lib/domain/repositories";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";

export class DexiePhotoOutboxRepository implements PhotoOutboxRepository {
  constructor(private readonly db: MedTrackingDexie = getClientDb()) {}

  async enqueue(input: PhotoOutboxEnqueueInput): Promise<void> {
    if (input.operation === "upload" && (!input.blob || !input.contentType)) {
      throw new Error("photo outbox: an 'upload' entry requires blob and contentType");
    }
    await this.db.photoOutboxEntry.put({
      userMedicationId: input.userMedicationId,
      operation: input.operation,
      blob: input.operation === "upload" ? (input.blob ?? null) : null,
      contentType: input.operation === "upload" ? (input.contentType ?? null) : null,
      enqueuedAt: new Date().toISOString(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date().toISOString(),
    });
  }

  async get(userMedicationId: string): Promise<{ operation: PhotoOutboxOperation; enqueuedAt: string } | null> {
    const row = await this.db.photoOutboxEntry.get(userMedicationId);
    if (!row) return null;
    return { operation: row.operation, enqueuedAt: row.enqueuedAt };
  }

  async listPending(
    now: string,
  ): Promise<{ userMedicationId: string; operation: PhotoOutboxOperation; blob: Blob | null; contentType: string | null; enqueuedAt: string; attempts: number }[]> {
    const rows = await this.db.photoOutboxEntry.where("status").notEqual("syncing").toArray();
    return rows
      .filter((row) => row.nextAttemptAt <= now)
      .map((row) => ({
        userMedicationId: row.userMedicationId,
        operation: row.operation,
        blob: row.blob,
        contentType: row.contentType,
        enqueuedAt: row.enqueuedAt,
        attempts: row.attempts,
      }));
  }

  async markSyncing(userMedicationId: string): Promise<void> {
    await this.db.photoOutboxEntry.update(userMedicationId, { status: "syncing" });
  }

  async markFailed(userMedicationId: string, error: string, nextAttemptAt: string): Promise<void> {
    const existing = await this.db.photoOutboxEntry.get(userMedicationId);
    await this.db.photoOutboxEntry.update(userMedicationId, {
      status: "failed",
      lastError: error,
      nextAttemptAt,
      attempts: (existing?.attempts ?? 0) + 1,
    });
  }

  async clearIfUnchanged(userMedicationId: string, enqueuedAt: string): Promise<boolean> {
    return this.db.transaction("rw", this.db.photoOutboxEntry, async () => {
      const current = await this.db.photoOutboxEntry.get(userMedicationId);
      if (!current || current.enqueuedAt !== enqueuedAt) return false;
      await this.db.photoOutboxEntry.delete(userMedicationId);
      return true;
    });
  }
}
