/**
 * Drains the photo outbox — deliberately a separate, purpose-built worker
 * rather than routing through `lib/sync/client/worker.ts`'s generic
 * `drainOutbox`/`syncMutationRequestSchema` protocol (2026-08-29 offline
 * audit, data-architect design). Three concrete reasons, not just
 * "photos are different":
 *
 * 1. That protocol's `payload` is JSON (`z.record(z.string(),
 *    z.unknown())`); getting a blob through it means base64 (~33% size
 *    inflation on up to an 8MB photo) inside a batched request that
 *    otherwise carries small, unrelated JSON mutations — coupling their
 *    delivery latency to a large binary transfer for no reason.
 * 2. `SyncEntityType`/`ENTITY_CONFLICT_STRATEGY` (`lib/domain/sync.ts`)
 *    is a promise that every member has a real, enforced conflict
 *    strategy. Photos have none — `lib/medications/server/photo.ts`
 *    deliberately never versions `user_medication` on a photo write, so
 *    adding a `"medicationPhoto"` entry there would misrepresent what's
 *    actually enforced server-side.
 * 3. The server endpoint is `app/api/medications/[id]/photo/route.ts`
 *    (multipart), not `/api/sync/mutations` — going through the generic
 *    protocol means special-casing multipart-vs-JSON inside a handler
 *    that's supposed to be entity-agnostic, i.e. writing this same
 *    parallel special case anyway, just hidden inside "generic" code.
 *
 * Retry/backoff *pattern* is still reused (`computeNextAttemptDelayMs`)
 * — only the transport and protocol differ.
 */
import { computeNextAttemptDelayMs } from "@/lib/domain/outbox";
import type { PhotoCacheRepository, PhotoOutboxRepository } from "@/lib/domain/repositories";
import { deleteMedicationPhoto, uploadMedicationPhoto } from "@/lib/medications/client/photo-api";
import { logger } from "@/lib/logging/logger";

export interface PhotoOutboxWorkerDeps {
  outbox: PhotoOutboxRepository;
  cache: PhotoCacheRepository;
  uploadPhoto?: typeof uploadMedicationPhoto;
  deletePhoto?: typeof deleteMedicationPhoto;
  now?: () => string;
}

export interface PhotoDrainSummary {
  attempted: number;
  synced: number;
  failed: number;
}

function addMs(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

/**
 * Processes every currently-due entry, one at a time (never concurrent
 * large uploads racing each other right after a reconnect). Safe to call
 * repeatedly/concurrently is NOT guaranteed — callers should serialize
 * invocations (see `sync-manager.ts`'s in-flight guard).
 */
export async function drainPhotoOutbox(deps: PhotoOutboxWorkerDeps): Promise<PhotoDrainSummary> {
  const now = deps.now ?? (() => new Date().toISOString());
  const upload = deps.uploadPhoto ?? uploadMedicationPhoto;
  const remove = deps.deletePhoto ?? deleteMedicationPhoto;

  const pending = await deps.outbox.listPending(now());
  const summary: PhotoDrainSummary = { attempted: pending.length, synced: 0, failed: 0 };

  for (const entry of pending) {
    await deps.outbox.markSyncing(entry.userMedicationId);
    try {
      if (entry.operation === "upload") {
        if (!entry.blob || !entry.contentType) {
          throw new Error("photo outbox: queued upload entry is missing its blob");
        }
        await upload(entry.userMedicationId, entry.blob);
        await deps.cache.put({ userMedicationId: entry.userMedicationId, blob: entry.blob, contentType: entry.contentType });
      } else {
        await remove(entry.userMedicationId);
        await deps.cache.remove(entry.userMedicationId);
      }

      // Compare-and-clear (see PhotoOutboxRepository.clearIfUnchanged doc):
      // a newer enqueue may have superseded this entry while the request
      // above was in flight. If so, leave the newer row alone — it'll be
      // picked up on the next drain pass — rather than counting this as
      // either a success or a failure.
      const cleared = await deps.outbox.clearIfUnchanged(entry.userMedicationId, entry.enqueuedAt);
      if (cleared) summary.synced++;
    } catch (err) {
      const attempts = entry.attempts + 1;
      const message = err instanceof Error ? err.message : "network error";
      await deps.outbox.markFailed(entry.userMedicationId, message, addMs(now(), computeNextAttemptDelayMs(attempts)));
      summary.failed++;
      logger.warn("photo_outbox.drain.entry_failed", { operation: entry.operation, attempts });
    }
  }

  return summary;
}
