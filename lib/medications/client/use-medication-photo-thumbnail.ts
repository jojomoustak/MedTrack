"use client";

import { useEffect, useState } from "react";
import { fetchMedicationPhoto } from "@/lib/medications/client/photo-api";
import { DexiePhotoCacheRepository } from "@/lib/medications/client/photo-cache-repository";

export type MedicationPhotoThumbnailStatus = "checking" | "present" | "absent";

/**
 * The medication list's row thumbnail. UX feedback (2026-09-26): the
 * original version fetched over the network on every single mount, even
 * for a photo already seen on a previous visit — cache-first here (the
 * same `DexiePhotoCacheRepository` `MedicationPhotoAttach` already uses,
 * see its own header doc for why photos have no offline-sync story but do
 * have this local view cache) means a repeat view of this list shows the
 * photo instantly, with the network call only ever revalidating quietly
 * in the background rather than blocking what's on screen.
 */
export function useMedicationPhotoThumbnail(userMedicationId: string): { status: MedicationPhotoThumbnailStatus; url: string | null } {
  const [status, setStatus] = useState<MedicationPhotoThumbnailStatus>("checking");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const cache = new DexiePhotoCacheRepository();

    async function load() {
      const cached = await cache.get(userMedicationId);
      if (cancelled) return;
      if (cached) {
        objectUrl = URL.createObjectURL(cached.blob);
        setUrl(objectUrl);
        setStatus("present");
      }

      try {
        const result = await fetchMedicationPhoto(userMedicationId);
        if (cancelled) return;
        if (!result) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = null;
          setUrl(null);
          setStatus("absent");
          await cache.remove(userMedicationId);
          return;
        }
        const fresh = URL.createObjectURL(result.blob);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = fresh;
        setUrl(fresh);
        setStatus("present");
        await cache.put({ userMedicationId, blob: result.blob, contentType: result.blob.type || "application/octet-stream" });
      } catch {
        if (cancelled) return;
        // Offline/transient failure: keep showing a cached copy if there
        // was one; otherwise fall back to the camera affordance rather
        // than leaving the row stuck on a loading skeleton forever.
        if (!cached) setStatus("absent");
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userMedicationId]);

  return { status, url };
}
