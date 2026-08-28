/**
 * User-uploaded medication photo (server side) — the domain/service layer
 * behind `app/api/medications/[id]/photo/route.ts`. Route handlers stay
 * thin (parse the request, call one of these, translate the result);
 * every authorization/validation/storage decision lives here so it's
 * directly unit-testable without spinning up a real HTTP request
 * (`security-privacy-reviewer` convention already used by
 * `lib/sync/server/mutations.ts` and `lib/account/server/delete-account.ts`).
 *
 * **Storage (`@vercel/blob`, private access):** every blob is written with
 * `access: "private"` — the SDK's own genuinely-authenticated access mode
 * (confirmed against the installed `@vercel/blob@2.8.0` types: `get()`
 * requires a matching `access` option and the underlying object is not
 * fetchable without the store's `BLOB_READ_WRITE_TOKEN`), not the
 * "public but the URL is long and random" pattern some other Vercel Blob
 * integrations lean on. The client NEVER receives a blob URL or pathname
 * in any response body — every read goes through `getMedicationPhoto()`
 * below, which fetches the bytes server-side (using this server's own
 * token) and the route streams them back over the already-authenticated,
 * already-ownership-checked `GET /api/medications/[id]/photo` connection.
 *
 * **Ownership (CLAUDE.md rule 7):** every function here takes the
 * `profileId` re-derived from the caller's own session
 * (`lib/auth/session.ts`) and re-validates it against `user_medication`'s
 * `profile_id` column server-side on every call — never a client-asserted
 * "this is mine". A mismatch or missing row is reported as `NotFoundError`
 * (never `AuthorizationError`) so a client probing another profile's
 * medication ids can't distinguish "not yours" from "doesn't exist"
 * (`lib/errors/app-error.ts`'s own documented convention).
 *
 * **Not part of the offline outbox/sync system.** Every other
 * `UserMedication` field goes local-first through IndexedDB + the sync
 * outbox (`lib/db-client/user-medication-repository.ts`); a photo does
 * not — there is no meaningful offline story for a binary blob (no local
 * fallback for Vercel Blob, unlike Postgres's `local-pg` escape hatch),
 * so uploading/viewing/removing a photo genuinely requires network, and
 * this module talks straight to Postgres + Vercel Blob, never through
 * `withProfileScope`'s sync-mutation ledger. `user_medication.version`
 * (the field the client's optimistic-concurrency sync path compares
 * against `baseVersion`) is deliberately NEVER bumped by a photo write —
 * see `setUserMedicationPhotoBlobKey`.
 */
import { del, get, put } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { getDb, type Db, type TestableDb } from "@/lib/db/client";
import { withProfileScope } from "@/lib/db/rls";
import { getEnv } from "@/lib/config/env";
import { isUuid } from "@/lib/domain/ids";
import { ConfigError, NotFoundError } from "@/lib/errors/app-error";
import { validateMedicationPhotoUpload } from "@/lib/validation/medication-photo";
import { logger } from "@/lib/logging/logger";
import { pseudonymize } from "@/lib/logging/redact";

export interface UploadMedicationPhotoInput {
  profileId: string;
  userMedicationId: string;
  file: {
    bytes: Uint8Array;
    contentType: string;
    size: number;
  };
}

export interface MedicationPhotoContent {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
  etag: string;
}

/**
 * Fails closed with a clear, operator-facing error rather than letting
 * `@vercel/blob` throw its own less-obvious "token missing" error deep
 * inside a `put()`/`get()`/`del()` call.
 *
 * Two independent ways this project's Blob store can be configured
 * (stabilization task, 2026-08-29 — found the deployed Production
 * environment had neither BLOB_READ_WRITE_TOKEN NOR any code path that
 * would have accepted the alternative): the classic static
 * BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID + Vercel's own OIDC federation
 * (a short-lived token Vercel injects into every deployed function
 * automatically as VERCEL_OIDC_TOKEN — never something this app reads or
 * validates directly, the SDK handles it). Either one being present is
 * sufficient; this function's job is only to fail fast with a clear
 * message when NEITHER is, not to prefer one over the other.
 */
function assertBlobConfigured(): void {
  const env = getEnv();
  if (!env.BLOB_READ_WRITE_TOKEN && !env.BLOB_STORE_ID) {
    throw new ConfigError(
      "Η αποθήκευση φωτογραφιών δεν έχει ρυθμιστεί ακόμα σε αυτό το περιβάλλον. Δοκιμάστε ξανά αργότερα.",
    );
  }
}

interface OwnedUserMedicationRow {
  id: string;
  photoBlobKey: string | null;
}

type AnyDb = Db | TestableDb;

/**
 * Re-derives ownership from the database on every call (CLAUDE.md rule 7)
 * — `id = ... AND profile_id = ...` in the same guarded query, same
 * defense-in-depth pattern as every other profile-scoped query in this
 * codebase (Phase 2 data model risk R13). Excludes soft-deleted rows: a
 * deleted medication's photo is not a live resource to attach/view/remove
 * through this route.
 */
async function getOwnedUserMedication(profileId: string, userMedicationId: string, db: AnyDb): Promise<OwnedUserMedicationRow> {
  if (!isUuid(userMedicationId)) {
    throw new NotFoundError("Δεν βρέθηκε αυτό το φάρμακο.");
  }

  const [result] = await withProfileScope(
    profileId,
    (scopedDb) => [
      scopedDb.execute(sql`
        SELECT id, photo_blob_key
        FROM user_medication
        WHERE id = ${userMedicationId}::uuid
          AND profile_id = ${profileId}::uuid
          AND deleted_at IS NULL
      `),
    ] as const,
    { db },
  );

  const row = (result as { rows?: Record<string, unknown>[] }).rows?.[0];
  if (!row) {
    throw new NotFoundError("Δεν βρέθηκε αυτό το φάρμακο.");
  }
  return { id: row.id as string, photoBlobKey: (row.photo_blob_key as string | null) ?? null };
}

/**
 * Sets (or clears, when `blobKey` is `null`) the stored blob reference.
 * Deliberately does NOT touch `version` — see this module's header doc:
 * a photo write must never make the client's next unrelated sync `update`
 * mutation (built against whatever `baseVersion` it last saw) spuriously
 * conflict.
 */
async function setUserMedicationPhotoBlobKey(profileId: string, userMedicationId: string, blobKey: string | null, db: AnyDb): Promise<void> {
  await withProfileScope(
    profileId,
    (scopedDb) => [
      scopedDb.execute(sql`
        UPDATE user_medication
        SET photo_blob_key = ${blobKey}, updated_at = now()
        WHERE id = ${userMedicationId}::uuid AND profile_id = ${profileId}::uuid
      `),
    ] as const,
    { db },
  );
}

function medicationPhotoPathname(profileId: string, userMedicationId: string): string {
  // Namespaced by profile as a purely operational convenience (e.g. an
  // ops runbook can `list({ prefix: "medication-photos/<profileId>/" })`
  // to find/clean up leftovers for one account) — NOT a security
  // boundary; `access: "private"` + never disclosing the pathname to any
  // client is what actually keeps this from being fetchable.
  return `medication-photos/${profileId}/${userMedicationId}`;
}

/**
 * Validates, uploads to Vercel Blob (private), and records the new
 * pathname — replacing (and best-effort cleaning up) any previous photo.
 *
 * Ordering rationale: upload the NEW blob and commit the DB row BEFORE
 * deleting the OLD blob. If the upload itself fails, nothing has changed
 * (old photo, if any, is untouched). If the DB update fails after a
 * successful upload, the new blob is a harmless orphan and the old photo
 * (still correctly referenced) keeps working — never a dangling
 * reference to a blob that's already gone. Deleting the old blob is the
 * LAST step and best-effort (logged, not thrown) for the same reason.
 */
export async function uploadMedicationPhoto(input: UploadMedicationPhotoInput, dbOverride?: AnyDb): Promise<void> {
  const contentType = validateMedicationPhotoUpload({
    contentType: input.file.contentType,
    size: input.file.size,
    bytes: input.file.bytes,
  });

  const db = dbOverride ?? getDb();
  const owned = await getOwnedUserMedication(input.profileId, input.userMedicationId, db);
  assertBlobConfigured();

  const pathname = medicationPhotoPathname(input.profileId, input.userMedicationId);
  // `@vercel/blob`'s `PutBody` doesn't include a bare `Uint8Array` (only
  // `Buffer`/`Blob`/`Readable`/etc.) — a plain, zero-copy wrap, not a data copy.
  const uploaded = await put(pathname, Buffer.from(input.file.bytes.buffer, input.file.bytes.byteOffset, input.file.bytes.byteLength), {
    access: "private",
    addRandomSuffix: true,
    contentType,
  });

  await setUserMedicationPhotoBlobKey(input.profileId, input.userMedicationId, uploaded.pathname, db);

  const medicationRef = pseudonymize(input.userMedicationId);
  logger.info("medication.photo.uploaded", { medicationRef });

  if (owned.photoBlobKey) {
    try {
      await del(owned.photoBlobKey);
    } catch (err) {
      logger.warn("medication.photo.previous_blob_cleanup_failed", {
        medicationRef,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Fetches the photo's bytes server-side (never a redirect/URL handed to
 * the client). Self-heals a stale DB pointer (blob genuinely missing,
 * e.g. deleted directly in the Vercel dashboard) by clearing it rather
 * than repeating the same failed lookup on every future request.
 */
export async function getMedicationPhoto(
  params: { profileId: string; userMedicationId: string },
  dbOverride?: AnyDb,
): Promise<MedicationPhotoContent> {
  const db = dbOverride ?? getDb();
  const owned = await getOwnedUserMedication(params.profileId, params.userMedicationId, db);
  if (!owned.photoBlobKey) {
    throw new NotFoundError("Δεν έχει προστεθεί φωτογραφία για αυτό το φάρμακο.");
  }

  assertBlobConfigured();
  const result = await get(owned.photoBlobKey, { access: "private" });
  if (!result || result.statusCode !== 200) {
    await setUserMedicationPhotoBlobKey(params.profileId, params.userMedicationId, null, db).catch(() => {
      // Best-effort self-heal only — the NotFoundError below is thrown either way.
    });
    logger.warn("medication.photo.blob_missing", { medicationRef: pseudonymize(params.userMedicationId) });
    throw new NotFoundError("Δεν έχει προστεθεί φωτογραφία για αυτό το φάρμακο.");
  }

  return {
    stream: result.stream,
    contentType: result.blob.contentType,
    size: result.blob.size,
    etag: result.blob.etag,
  };
}

/** Idempotent no-op when there's no photo to remove — never an error just because there was nothing to do. */
export async function deleteMedicationPhoto(params: { profileId: string; userMedicationId: string }, dbOverride?: AnyDb): Promise<void> {
  const db = dbOverride ?? getDb();
  const owned = await getOwnedUserMedication(params.profileId, params.userMedicationId, db);
  if (!owned.photoBlobKey) return;

  // Clear the DB pointer FIRST: the DB row is the source of truth for
  // "does this medication have a photo" from the client's point of view,
  // and it must never keep pointing at a blob we're about to delete.
  await setUserMedicationPhotoBlobKey(params.profileId, params.userMedicationId, null, db);

  const medicationRef = pseudonymize(params.userMedicationId);
  try {
    assertBlobConfigured();
    await del(owned.photoBlobKey);
    logger.info("medication.photo.deleted", { medicationRef });
  } catch (err) {
    logger.warn("medication.photo.delete_blob_failed", { medicationRef, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Read-only: every non-null photo blob pathname for a profile's
 * medications, regardless of soft-delete state (used by account deletion,
 * which purges rows unconditionally — see `lib/account/server/
 * delete-account.ts`). Never throws for "none found" — an empty array is
 * the normal case for most accounts.
 */
export async function collectMedicationPhotoBlobKeysForProfile(profileId: string, dbOverride?: AnyDb): Promise<string[]> {
  const db = dbOverride ?? getDb();
  const [result] = await withProfileScope(
    profileId,
    (scopedDb) => [
      scopedDb.execute(sql`
        SELECT photo_blob_key FROM user_medication
        WHERE profile_id = ${profileId}::uuid AND photo_blob_key IS NOT NULL
      `),
    ] as const,
    { db },
  );
  const rows = (result as { rows?: Record<string, unknown>[] }).rows ?? [];
  return rows.map((r) => r.photo_blob_key as string);
}

/** Deletes one blob by its stored pathname/key. Exposed standalone (not wrapped in try/catch here) so callers like `deleteAccount` control their own best-effort/logging policy around it. */
export async function deleteMedicationPhotoBlobByKey(blobKey: string): Promise<void> {
  assertBlobConfigured();
  await del(blobKey);
}
