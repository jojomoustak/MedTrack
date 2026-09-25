"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMedicationPhotoThumbnail } from "@/lib/medications/client/use-medication-photo-thumbnail";
import { uploadMedicationPhoto, MedicationPhotoApiError } from "@/lib/medications/client/photo-api";
import { DexiePhotoCacheRepository } from "@/lib/medications/client/photo-cache-repository";
import { ALLOWED_MEDICATION_PHOTO_CONTENT_TYPES, MAX_MEDICATION_PHOTO_BYTES } from "@/lib/validation/medication-photo";
import { playSound } from "@/lib/sound/client/play-sound";

function isAllowedClientSide(file: File): boolean {
  return file.size <= MAX_MEDICATION_PHOTO_BYTES && (ALLOWED_MEDICATION_PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type);
}

/**
 * The medication list row's photo slot (UX feedback, 2026-09-26): a real
 * photo once one exists — tap it to open the full photo page (view,
 * replace, remove). Otherwise a camera icon that opens the device camera
 * directly, right from the list (`capture="environment"`, the same
 * mechanism `MedicationPhotoAttach` already uses) — no navigation, no
 * extra tap first. Replaces the old plain "Φωτογραφία" text link, which
 * this now fully subsumes.
 */
export function MedicationThumbnail({ userMedicationId }: { userMedicationId: string }) {
  const { status, url } = useMedicationPhotoThumbnail(userMedicationId);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);

  useEffect(() => {
    return () => {
      if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    };
  }, [uploadedUrl]);

  const displayUrl = uploadedUrl ?? url;

  if (displayUrl) {
    return (
      <Link
        href={`/medications/${userMedicationId}/photo`}
        onClick={() => playSound("button")}
        aria-label="Προβολή φωτογραφίας φαρμάκου"
        className="shrink-0 transition-transform duration-150 active:scale-95"
      >
        <img src={displayUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
      </Link>
    );
  }

  if (status === "checking") {
    return <div aria-hidden="true" className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-stone-100 dark:bg-stone-800" />;
  }

  async function handleFileSelected(file: File) {
    if (!isAllowedClientSide(file)) {
      setUploadFailed(true);
      return;
    }
    setUploading(true);
    setUploadFailed(false);
    try {
      await uploadMedicationPhoto(userMedicationId, file);
      await new DexiePhotoCacheRepository().put({ userMedicationId, blob: file, contentType: file.type });
      setUploadedUrl(URL.createObjectURL(file));
      playSound("success");
    } catch (err) {
      // Offline/failed: no outbox queueing here on purpose — this is a
      // fast-path convenience, and MedicationPhotoAttach on the dedicated
      // photo page already covers the full offline-retry story for
      // exactly this operation.
      if (err instanceof MedicationPhotoApiError) setUploadFailed(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <label
      onClick={() => {
        if (!uploading) playSound("button");
      }}
      aria-label={uploadFailed ? "Η λήψη φωτογραφίας απέτυχε — πατήστε για να δοκιμάσετε ξανά" : "Λήψη φωτογραφίας φαρμάκου"}
      className={`flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition-transform duration-150 active:scale-95 ${
        uploadFailed ? "border-red-300 text-red-400 dark:border-red-900 dark:text-red-500" : "border-stone-300 text-stone-400 dark:border-stone-700 dark:text-stone-600"
      }`}
    >
      {uploading ? (
        <span
          aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-accent-700 dark:border-stone-700 dark:border-t-accent-500"
        />
      ) : (
        <CameraIcon />
      )}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleFileSelected(file);
        }}
      />
    </label>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 8h3l1.4-2.1c.2-.3.5-.4.9-.4h5.4c.4 0 .7.1.9.4L16 8h4a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="12" cy="13.2" r="3.2" />
    </svg>
  );
}
