"use client";

import { useEffect, useState } from "react";
import { fetchMedicationPhoto } from "@/lib/medications/client/photo-api";

/**
 * The medication list's row thumbnail (UX feedback, 2026-09-24) — reuses
 * the existing online-only `fetchMedicationPhoto` (photos have no offline
 * story, see `lib/medications/server/photo.ts`'s header doc) rather than a
 * new batch-listing endpoint; a handful of per-row GETs for a typical
 * medication list is the same cost class this app already pays on the
 * dedicated photo page. Returns `null` while loading, offline, or when
 * there's simply no photo yet — none of those block the row from rendering.
 */
export function useMedicationPhotoThumbnail(userMedicationId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    fetchMedicationPhoto(userMedicationId)
      .then((result) => {
        if (cancelled || !result) return;
        objectUrl = URL.createObjectURL(result.blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        // Offline/transient failure — a missing thumbnail on a list row
        // isn't worth surfacing as an error.
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userMedicationId]);

  return url;
}
