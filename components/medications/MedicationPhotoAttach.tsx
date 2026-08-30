"use client";

import { useEffect, useRef, useState } from "react";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexiePhotoCacheRepository } from "@/lib/medications/client/photo-cache-repository";
import { DexiePhotoOutboxRepository } from "@/lib/medications/client/photo-outbox-repository";
import { onPhotoOutboxWrite } from "@/lib/medications/client/photo-outbox-signal";
import type { PhotoCacheRepository, PhotoOutboxOperation, PhotoOutboxRepository, UserMedicationRepository } from "@/lib/domain/repositories";
import {
  MedicationPhotoApiError,
  deleteMedicationPhoto as deletePhotoRequest,
  fetchMedicationPhoto,
  uploadMedicationPhoto as uploadPhotoRequest,
} from "@/lib/medications/client/photo-api";
import { ALLOWED_MEDICATION_PHOTO_CONTENT_TYPES, MAX_MEDICATION_PHOTO_BYTES } from "@/lib/validation/medication-photo";

const POLL_INTERVAL_MS = 1500;
/** ~60s of polling before giving up and asking the user to retry manually — a freshly-created medication is expected to sync within a few seconds when online; this is a generous ceiling, not a tight timeout. */
const MAX_POLL_ATTEMPTS = 40;

export interface MedicationPhotoAttachProps {
  userMedicationId: string;
  /** Test/DI seam — defaults to a real Dexie-backed repository, only used to watch this medication's local `syncState`. */
  repository?: UserMedicationRepository;
  /** Test/DI seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Test/DI seam — defaults to a real Dexie-backed local view cache (2026-08-29 offline audit). */
  photoCache?: PhotoCacheRepository;
  /** Test/DI seam — defaults to a real Dexie-backed queue for offline upload/delete. */
  photoOutbox?: PhotoOutboxRepository;
  className?: string;
}

type PhotoStatus = "checking" | "present" | "absent";

function isAllowedClientSide(file: File): string | null {
  if (file.size > MAX_MEDICATION_PHOTO_BYTES) {
    return "Το αρχείο είναι πολύ μεγάλο. Το μέγιστο μέγεθος είναι 8MB.";
  }
  if (!(ALLOWED_MEDICATION_PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return "Μη υποστηριζόμενος τύπος αρχείου. Χρησιμοποιήστε φωτογραφία JPEG, PNG ή WEBP.";
  }
  return null;
}

/** True only for `fetchOrThrowOffline`'s network-failure sentinel (`photo-api.ts`) — a real HTTP error response always carries a `status`. */
function isOfflineError(err: unknown): boolean {
  return err instanceof MedicationPhotoApiError && err.status === undefined;
}

/**
 * Optional, non-blocking "attach a photo of your own medication package"
 * control (Phase 3-style component, not itself a full screen). Reused
 * both right after creating a medication (`app/medications/[id]/photo/
 * page.tsx`, reached from the Add Medication flow) and from the
 * medications list (same route, no separate detail page exists yet — see
 * that page's own doc comment).
 *
 * A freshly-created `UserMedication` may not exist on the server yet (the
 * write is local-first, Phase 5/6's outbox pattern) — the photo endpoints
 * need a REAL server-side row to attach to, so this component watches the
 * record's local `syncState` and only shows upload controls once it's
 * `"synced"`, rather than letting an upload attempt fail with a confusing
 * "not found" for a device that's simply still catching up (or offline).
 *
 * Offline behavior (2026-08-29 audit, data-architect design): viewing
 * shows a locally-cached copy instantly, then revalidates against the
 * server in the background when online — see `photo-cache-repository.ts`.
 * Uploading/removing while offline queues the operation
 * (`photo-outbox-repository.ts`/`photo-outbox-worker.ts`) instead of just
 * failing; the picked photo (or its removal) is reflected immediately,
 * but ALWAYS with a visible pending label — never silently presented as
 * saved before the server has actually confirmed it (see this codebase's
 * `designing-offline-sync` rule: a critical change must never disappear
 * from the UI, or claim success, silently).
 */
export function MedicationPhotoAttach({ userMedicationId, repository, fetchImpl, photoCache, photoOutbox, className }: MedicationPhotoAttachProps) {
  const repo = repository ?? new DexieUserMedicationRepository();
  const fetcher = fetchImpl ?? fetch;
  const cache = photoCache ?? new DexiePhotoCacheRepository();
  const outbox = photoOutbox ?? new DexiePhotoOutboxRepository();

  const [synced, setSynced] = useState(false);
  const [pollExhausted, setPollExhausted] = useState(false);
  const [pollNonce, setPollNonce] = useState(0);

  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>("checking");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [pendingOp, setPendingOp] = useState<PhotoOutboxOperation | null>(null);
  const [offlineNote, setOfflineNote] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  function showBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;
    setPhotoUrl(url);
  }

  function clearBlob() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPhotoUrl(null);
  }

  // Poll local sync state until the server-side row is confirmed to exist.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      const record = await repo.get(userMedicationId);
      if (cancelled) return;
      if (record?.syncState === "synced") {
        setSynced(true);
        return;
      }
      attempts += 1;
      if (attempts >= MAX_POLL_ATTEMPTS) {
        setPollExhausted(true);
        return;
      }
      timer = setTimeout(() => void check(), POLL_INTERVAL_MS);
    }

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `repo` is stable per render tree (default constructed once via module-level DI convention used throughout this codebase).
  }, [userMedicationId, pollNonce]);

  // A background drain elsewhere (this same reconnect, or another tab)
  // may have just cleared this medication's queued entry — re-check so
  // the pending badge doesn't outlive the thing it was describing.
  useEffect(() => onPhotoOutboxWrite(() => setRefreshNonce((n) => n + 1)), []);

  // Once synced: show whatever's queued/cached immediately, then — only
  // when nothing is queued — revalidate against the server in the
  // background. Skipping the live fetch entirely while something is
  // queued avoids a stale server response fighting the optimistic local
  // state that was written at enqueue time.
  useEffect(() => {
    if (!synced) return;
    let cancelled = false;

    async function load() {
      setError(null);
      setOfflineNote(false);

      const queued = await outbox.get(userMedicationId);
      if (cancelled) return;
      setPendingOp(queued?.operation ?? null);

      const cached = await cache.get(userMedicationId);
      if (cancelled) return;
      if (cached) {
        showBlob(cached.blob);
        setPhotoStatus("present");
        void cache.touch(userMedicationId);
      } else if (queued?.operation === "delete") {
        clearBlob();
        setPhotoStatus("absent");
      } else {
        setPhotoStatus("checking");
      }

      if (queued) return;

      try {
        const result = await fetchMedicationPhoto(userMedicationId, fetcher);
        if (cancelled) return;
        if (!result) {
          clearBlob();
          setPhotoStatus("absent");
          await cache.remove(userMedicationId);
          return;
        }
        showBlob(result.blob);
        setPhotoStatus("present");
        await cache.put({ userMedicationId, blob: result.blob, contentType: result.blob.type || "application/octet-stream" });
      } catch (err) {
        if (cancelled) return;
        if (cached) return; // already showing a good cached copy — degrade silently
        setPhotoStatus("absent");
        if (isOfflineError(err)) {
          setOfflineNote(true);
        } else {
          setError("Δεν ήταν δυνατή η φόρτωση της φωτογραφίας.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, userMedicationId, refreshNonce]);

  // Revoke the last object URL on unmount.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function handleFileSelected(file: File) {
    const clientError = isAllowedClientSide(file);
    if (clientError) {
      setError(clientError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadPhotoRequest(userMedicationId, file, fetcher);
      await cache.put({ userMedicationId, blob: file, contentType: file.type });
      setPendingOp(null);
      setRefreshNonce((n) => n + 1);
    } catch (err) {
      if (isOfflineError(err)) {
        await outbox.enqueue({ userMedicationId, operation: "upload", blob: file, contentType: file.type });
        // Optimistic local display — but the pending badge below is what
        // keeps this honest rather than silently claiming "saved".
        await cache.put({ userMedicationId, blob: file, contentType: file.type });
        setPendingOp("upload");
        setRefreshNonce((n) => n + 1);
      } else {
        setError(err instanceof MedicationPhotoApiError ? err.message : "Κάτι πήγε στραβά. Δοκιμάστε ξανά.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await deletePhotoRequest(userMedicationId, fetcher);
      await cache.remove(userMedicationId);
      setPendingOp(null);
      setRefreshNonce((n) => n + 1);
    } catch (err) {
      if (isOfflineError(err)) {
        await outbox.enqueue({ userMedicationId, operation: "delete" });
        await cache.remove(userMedicationId);
        setPendingOp("delete");
        setRefreshNonce((n) => n + 1);
      } else {
        setError(err instanceof MedicationPhotoApiError ? err.message : "Κάτι πήγε στραβά. Δοκιμάστε ξανά.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!synced) {
    return (
      <div className={className}>
        {pollExhausted ? (
          <div className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>Το φάρμακο δεν έχει συγχρονιστεί ακόμα, οπότε δεν μπορείτε να προσθέσετε φωτογραφία αυτή τη στιγμή.</p>
            <button
              type="button"
              onClick={() => {
                setPollExhausted(false);
                setPollNonce((n) => n + 1);
              }}
              className="min-h-12 self-start rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Δοκιμή ξανά
            </button>
          </div>
        ) : (
          <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
            Αναμονή συγχρονισμού πριν την προσθήκη φωτογραφίας…
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex flex-col gap-3">
        {photoStatus === "present" && photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- `photoUrl` is a local `blob:` object URL from an authenticated fetch (or a locally-cached/queued copy), never a remote asset `next/image` can optimize.
          <img
            src={photoUrl}
            alt="Φωτογραφία φαρμάκου"
            className="max-h-64 w-full rounded-xl border border-zinc-200 object-contain dark:border-zinc-800"
          />
        )}

        {pendingOp === "upload" && (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
            Θα μεταφορτωθεί μόλις επανασυνδεθείτε στο διαδίκτυο.
          </p>
        )}
        {pendingOp === "delete" && (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
            Θα αφαιρεθεί μόλις επανασυνδεθείτε στο διαδίκτυο.
          </p>
        )}
        {offlineNote && !pendingOp && (
          <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
            Δεν ήταν δυνατή η σύνδεση για έλεγχο φωτογραφίας.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <label
            className={`min-h-12 flex-1 cursor-pointer rounded-full border border-zinc-300 px-4 py-2 text-center text-sm font-medium dark:border-zinc-700 ${busy ? "opacity-60" : ""}`}
          >
            {busy ? "Μεταφόρτωση…" : photoStatus === "present" ? "Αλλαγή φωτογραφίας" : "Προσθήκη φωτογραφίας (προαιρετικό)"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleFileSelected(file);
              }}
            />
          </label>

          {photoStatus === "present" && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={busy}
              aria-busy={busy}
              className="min-h-12 rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60 dark:border-red-900 dark:text-red-400"
            >
              Αφαίρεση
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
