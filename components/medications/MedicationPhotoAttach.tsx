"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { playSound } from "@/lib/sound/client/play-sound";
import { browserLiveCamera, stopStream, type LiveCamera } from "@/lib/camera/client/live-camera";
import { makePhotoThumbnail, shrinkPhotoForUpload } from "@/lib/medications/client/photo-thumbnail";
import { removeLocalPhotoThumbnail, setLocalPhotoThumbnail, syncPhotoThumbnails } from "@/lib/medications/client/use-medication-photo-thumbnail";
import { CameraViewfinder } from "@/components/medications/CameraViewfinder";

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
  /** Test/DI seam — defaults to the browser's camera (`getUserMedia`). */
  camera?: LiveCamera;
  /** The screen's top row (close, title): the page decides what leaving means. */
  top?: React.ReactNode;
  /** Under the frame while there's no photo, instead of the plain instruction (e.g. right after adding the medication). */
  intro?: string;
}

const INSTRUCTION = "Τοποθετήστε τη συσκευασία του φαρμάκου μέσα στο πλαίσιο.";

type PhotoStatus = "checking" | "present" | "absent";

/**
 * `off`: can show the camera, not showing it. `live`: the viewfinder is
 * the camera. `unavailable` / `blocked` (no camera API, or permission
 * refused): the shutter opens the phone's own camera app instead.
 */
type CameraState = "off" | "live" | "unavailable" | "blocked";

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
 * camera screen, full-screen in the native scanner screens' style since
 * 2026-10-15 (`CameraViewfinder`); the page supplies the top row. Reused
 * both right after creating a medication (`app/medications/item/photo/
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
export function MedicationPhotoAttach({ userMedicationId, repository, fetchImpl, photoCache, photoOutbox, camera, top, intro }: MedicationPhotoAttachProps) {
  const repo = repository ?? new DexieUserMedicationRepository();
  const fetcher = fetchImpl ?? fetch;
  const cache = photoCache ?? new DexiePhotoCacheRepository();
  const outbox = photoOutbox ?? new DexiePhotoOutboxRepository();
  const cam = camera ?? browserLiveCamera;

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

  // Never rendered on the server (the page shows it only once signed in), so reading the browser here is safe.
  const [cameraState, setCameraState] = useState<CameraState>(() => (cam.supported() ? "off" : "unavailable"));
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  /** Goes off by itself whenever the camera is released. */
  const [torchOn, setTorchOn] = useState(false);
  const unmountedRef = useRef(false);
  const autoStartedRef = useRef(false);
  /** Camera released because the app went to the background — reopened when it's back. */
  const resumeCameraRef = useRef(false);

  const stopCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setTorchOn(false);
    setCameraState((state) => (state === "live" ? "off" : state));
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const opened = await cam.open();
      if (unmountedRef.current) {
        stopStream(opened);
        return;
      }
      stopStream(streamRef.current);
      streamRef.current = opened;
      setStream(opened);
      setTorchOn(false);
      setCameraState("live");
    } catch (err) {
      if (unmountedRef.current) return;
      const refused = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      setCameraState(refused ? "blocked" : "unavailable");
    }
  }, [cam]);

  /** The live stream goes into whichever `<video>` is mounted. */
  const attachVideo = useCallback(
    (video: HTMLVideoElement | null) => {
      videoRef.current = video;
      if (video && stream && video.srcObject !== stream) {
        video.srcObject = stream;
        void Promise.resolve(video.play()).catch(() => {});
      }
    },
    [stream],
  );

  // Release the camera when leaving the screen, and while the app is in
  // the background (the camera light must not stay on behind other apps).
  useEffect(() => {
    unmountedRef.current = false;
    function onVisibilityChange() {
      if (document.visibilityState === "hidden" && streamRef.current) {
        resumeCameraRef.current = true;
        stopCamera();
      } else if (document.visibilityState === "visible" && resumeCameraRef.current) {
        resumeCameraRef.current = false;
        void startCamera();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      unmountedRef.current = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [startCamera, stopCamera]);

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
        // Sends the cached copy's version: an unchanged photo isn't downloaded again.
        const result = await fetchMedicationPhoto(userMedicationId, fetcher, { etag: cached?.etag });
        if (cancelled) return;
        if (result && "notModified" in result) return;
        if (!result) {
          clearBlob();
          setPhotoStatus("absent");
          await cache.remove(userMedicationId);
          await removeLocalPhotoThumbnail(userMedicationId);
          return;
        }
        showBlob(result.blob);
        setPhotoStatus("present");
        const thumbnail = await makePhotoThumbnail(result.blob);
        await cache.put({ userMedicationId, blob: result.blob, contentType: result.blob.type || "application/octet-stream", thumbnail, etag: result.etag });
        await setLocalPhotoThumbnail(userMedicationId, thumbnail);
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

  // No photo yet: the screen opens straight into the camera, once — after
  // that, the shutter reopens it.
  useEffect(() => {
    if (!synced || photoStatus !== "absent" || cameraState !== "off" || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startCamera();
  }, [synced, photoStatus, cameraState, startCamera]);

  // Revoke the last object URL on unmount.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function handleFileSelected(picked: File) {
    setBusy(true);
    setError(null);
    try {
      // A gallery photo can be 12 megapixels and several MB: shrunk to what
      // a package needs before it's stored or sent (2026-10-09) — which also
      // lets an over-8 MB original through instead of rejecting it.
      const file = await shrinkPhotoForUpload(picked);
      const clientError = isAllowedClientSide(file);
      if (clientError) {
        setError(clientError);
        return;
      }
      const thumbnail = await makePhotoThumbnail(file);
      try {
        const { etag } = await uploadPhotoRequest(userMedicationId, file, fetcher);
        await cache.put({ userMedicationId, blob: file, contentType: file.type, thumbnail, etag });
        await setLocalPhotoThumbnail(userMedicationId, thumbnail);
        // The server's own thumbnail and version for it, for every device.
        void syncPhotoThumbnails();
        setPendingOp(null);
        setRefreshNonce((n) => n + 1);
      } catch (err) {
        if (isOfflineError(err)) {
          await outbox.enqueue({ userMedicationId, operation: "upload", blob: file, contentType: file.type });
          // Optimistic local display — but the pending badge below is what
          // keeps this honest rather than silently claiming "saved".
          await cache.put({ userMedicationId, blob: file, contentType: file.type, thumbnail });
          await setLocalPhotoThumbnail(userMedicationId, thumbnail);
          setPendingOp("upload");
          setRefreshNonce((n) => n + 1);
        } else {
          setError(err instanceof MedicationPhotoApiError ? err.message : "Κάτι πήγε στραβά. Δοκιμάστε ξανά.");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  /** The shutter, while the viewfinder is live: the photo is what's inside the frame, saved through the same path as a picked file. */
  async function handleCapture() {
    const video = videoRef.current;
    if (!video || busy) return;
    playSound("button");
    const videoBox = video.getBoundingClientRect();
    const frameBox = frameRef.current?.getBoundingClientRect() ?? videoBox;
    let blob: Blob;
    try {
      blob = await cam.capture(video, { x: frameBox.left - videoBox.left, y: frameBox.top - videoBox.top, width: frameBox.width, height: frameBox.height });
    } catch {
      setError("Η λήψη δεν ήταν δυνατή. Δοκιμάστε ξανά.");
      return;
    }
    stopCamera();
    await handleFileSelected(new File([blob], "medication-photo.jpg", { type: "image/jpeg" }));
  }

  async function toggleTorch() {
    const current = streamRef.current;
    if (!current || !cam.setTorch) return;
    playSound("button");
    const next = !torchOn;
    try {
      await cam.setTorch(current, next);
      setTorchOn(next);
    } catch {
      // The camera refused: the button keeps showing what's really on.
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await deletePhotoRequest(userMedicationId, fetcher);
      await cache.remove(userMedicationId);
      await removeLocalPhotoThumbnail(userMedicationId);
      setPendingOp(null);
      setRefreshNonce((n) => n + 1);
    } catch (err) {
      if (isOfflineError(err)) {
        await outbox.enqueue({ userMedicationId, operation: "delete" });
        await cache.remove(userMedicationId);
        await removeLocalPhotoThumbnail(userMedicationId);
        setPendingOp("delete");
        setRefreshNonce((n) => n + 1);
      } else {
        setError(err instanceof MedicationPhotoApiError ? err.message : "Κάτι πήγε στραβά. Δοκιμάστε ξανά.");
      }
    } finally {
      setBusy(false);
    }
  }

  const packageIcon = (
    <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M10 22 32 12l22 10v24L32 56 10 46Z" />
      <path d="M10 22 32 32l22-10M32 32v24" />
    </svg>
  );

  if (!synced) {
    return (
      <CameraViewfinder
        top={top}
        below={
          pollExhausted ? (
            <>
              <p>Το φάρμακο δεν έχει συγχρονιστεί ακόμα, οπότε δεν μπορείτε να προσθέσετε φωτογραφία αυτή τη στιγμή.</p>
              <button
                type="button"
                onClick={() => {
                  playSound("button");
                  setPollExhausted(false);
                  setPollNonce((n) => n + 1);
                }}
                className="mt-2 min-h-12 rounded-xl border border-white/40 px-5 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Δοκιμή ξανά
              </button>
            </>
          ) : (
            <p role="status">Αναμονή συγχρονισμού πριν την προσθήκη φωτογραφίας…</p>
          )
        }
      >
        <span className="text-white/35">{packageIcon}</span>
      </CameraViewfinder>
    );
  }

  const picker = (capture: boolean, label?: string) => (
    <input
      type="file"
      accept="image/*"
      {...(capture ? { capture: "environment" as const } : {})}
      {...(label ? { "aria-label": label } : {})}
      className="sr-only"
      disabled={busy}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        stopCamera();
        void handleFileSelected(file);
      }}
    />
  );

  const live = cameraState === "live" && stream !== null;
  const torchAvailable = live && stream !== null && cam.hasTorch?.(stream) === true;
  const showingPhoto = !live && photoStatus === "present" && photoUrl !== null;

  const shutterLabel = busy ? "Μεταφόρτωση…" : live ? "Λήψη φωτογραφίας" : photoStatus === "present" ? "Νέα φωτογραφία" : "Προσθήκη φωτογραφίας";
  const shutterFace = (
    <>
      <span aria-hidden="true" className="flex size-19 items-center justify-center rounded-full border-4 border-white/90 motion-safe:transition-transform motion-safe:duration-150 active:scale-95">
        {busy ? <span className="size-7 animate-spin rounded-full border-3 border-white/30 border-t-white" /> : <span className="size-14.5 rounded-full bg-white" />}
      </span>
      <span className="text-[13px] font-semibold whitespace-nowrap text-white">{shutterLabel}</span>
    </>
  );
  const focusRing = "rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-white";
  const shutterClasses = `flex flex-col items-center gap-2 justify-self-center ${focusRing} ${busy ? "opacity-60" : "cursor-pointer"}`;
  // Side buttons: 56px circles, their centres level with the 76px shutter's.
  const sideClasses = `mt-2.5 flex flex-col items-center gap-2 justify-self-center ${focusRing}`;
  const sideCircle = "flex size-14 items-center justify-center rounded-full motion-safe:transition-colors";
  const sideLabel = "text-[13px] font-semibold text-white";

  // Under the frame: what's happening, or else what to do.
  const notes = [
    pendingOp === "upload" && (
      <p key="upload" role="status" className="text-amber-300">
        Θα μεταφορτωθεί μόλις επανασυνδεθείτε στο διαδίκτυο.
      </p>
    ),
    pendingOp === "delete" && (
      <p key="delete" role="status" className="text-amber-300">
        Θα αφαιρεθεί μόλις επανασυνδεθείτε στο διαδίκτυο.
      </p>
    ),
    offlineNote && !pendingOp && (
      <p key="offline" role="status">
        Δεν ήταν δυνατή η σύνδεση για έλεγχο φωτογραφίας.
      </p>
    ),
    cameraState === "blocked" && (
      <p key="blocked" role="status">
        Δεν δόθηκε πρόσβαση στην κάμερα — το κουμπί λήψης ανοίγει την κάμερα του κινητού.
      </p>
    ),
    error && (
      <p key="error" role="alert" className="text-red-300">
        {error}
      </p>
    ),
  ].filter(Boolean);
  const instruction = !showingPhoto && photoStatus !== "checking" ? <p>{photoStatus === "absent" && intro ? intro : INSTRUCTION}</p> : null;

  return (
    <CameraViewfinder
      top={top}
      dimmed={live}
      frameRef={frameRef}
      background={live ? <video ref={attachVideo} autoPlay muted playsInline aria-label="Κάμερα" className="h-full w-full object-cover" /> : undefined}
      below={
        <>
          {notes.length > 0 ? notes : instruction}
          {live && photoStatus === "present" && (
            <button
              type="button"
              onClick={() => {
                playSound("button");
                stopCamera();
              }}
              className="min-h-11 px-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-white"
            >
              Ακύρωση
            </button>
          )}
          {showingPhoto && (
            <button
              type="button"
              onClick={() => {
                playSound("button");
                void handleRemove();
              }}
              disabled={busy}
              aria-busy={busy}
              className="min-h-11 px-3 font-semibold text-red-300 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50"
            >
              Αφαίρεση φωτογραφίας
            </button>
          )}
        </>
      }
      controls={
        // Gallery · shutter · torch. The shutter takes what's in the frame;
        // where the page can't use the camera it opens the phone's camera app.
        <div className="mx-auto grid max-w-sm grid-cols-3 items-start">
          <label
            onClick={() => {
              if (!busy) playSound("button");
            }}
            className={`${sideClasses} ${busy ? "opacity-60" : "cursor-pointer"}`}
          >
            <span aria-hidden="true" className={`${sideCircle} bg-white/15 active:bg-white/25`}>
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="white" strokeWidth="1.8" strokeLinejoin="round">
                <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
                <circle cx="9" cy="10" r="1.8" />
                <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" strokeLinecap="round" />
              </svg>
            </span>
            <span aria-hidden="true" className={sideLabel}>
              Συλλογή
            </span>
            {picker(false, "Επιλογή από τη συλλογή")}
          </label>

          {live || cameraState === "off" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (live) void handleCapture();
                else {
                  playSound("button");
                  void startCamera();
                }
              }}
              className={shutterClasses}
            >
              {shutterFace}
            </button>
          ) : (
            <label
              onClick={() => {
                if (!busy) playSound("button");
              }}
              className={shutterClasses}
            >
              {shutterFace}
              {picker(true)}
            </label>
          )}

          {torchAvailable ? (
            <button type="button" aria-pressed={torchOn} onClick={() => void toggleTorch()} className={sideClasses}>
              <span aria-hidden="true" className={`${sideCircle} ${torchOn ? "bg-white text-stone-900" : "bg-white/15 text-white active:bg-white/25"}`}>
                <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">
                  <path d="M13 2.5 4.5 13.5H11L10 21.5 19.5 10H13Z" />
                </svg>
              </span>
              <span className={sideLabel}>Φακός</span>
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
      }
    >
      {showingPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- `photoUrl` is a local `blob:` object URL from an authenticated fetch (or a locally-cached/queued copy), never a remote asset `next/image` can optimize.
        <img src={photoUrl ?? undefined} alt="Φωτογραφία φαρμάκου" className="h-full w-full object-contain" />
      ) : live ? null : (
        // While the saved photo is looked up, the frame's icon pulses instead of a "Φόρτωση…" line.
        <span className={`text-white/35 ${photoStatus === "checking" ? "motion-safe:animate-pulse" : ""}`}>
          {packageIcon}
          {photoStatus === "checking" && (
            <span role="status" className="sr-only">
              Φόρτωση…
            </span>
          )}
        </span>
      )}
    </CameraViewfinder>
  );
}
