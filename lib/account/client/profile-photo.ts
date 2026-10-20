"use client";

import { useCallback, useEffect, useState } from "react";
import { CACHED_PROFILE_PHOTO_KEY, getCachedProfileId } from "@/lib/auth/client/use-current-profile";
import { makePhotoThumbnail, shrinkPhotoForUpload } from "@/lib/medications/client/photo-thumbnail";
import { MAX_MEDICATION_PHOTO_BYTES } from "@/lib/validation/medication-photo";

const ENDPOINT = "/api/profile/photo";
/** The phone's copy: the avatar is 96 CSS px, sharp on a 3x screen; a few tens of KB in storage. */
const LOCAL_PX = 320;
/** What's sent: a centred square made on the phone, so the original file (its location data included) never leaves it. */
const UPLOAD_PX = 1024;
const DATA_URL_PREFIX = "data:image/";

/** The phone's copy: shown at once and offline, checked against the server when online. */
interface CachedPhoto {
  profileId: string;
  etag: string | null;
  dataUrl: string;
}

function readCache(profileId: string): CachedPhoto | null {
  try {
    const raw = localStorage.getItem(CACHED_PROFILE_PHOTO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedPhoto>;
    return parsed.profileId === profileId && typeof parsed.dataUrl === "string" && parsed.dataUrl.startsWith(DATA_URL_PREFIX)
      ? { profileId, etag: parsed.etag ?? null, dataUrl: parsed.dataUrl }
      : null;
  } catch {
    return null;
  }
}

function writeCache(photo: CachedPhoto | null): void {
  // Not for a profile that has signed out meanwhile (a request still in flight as sign-out ran).
  if (photo && getCachedProfileId() !== photo.profileId) return;
  try {
    if (photo) localStorage.setItem(CACHED_PROFILE_PHOTO_KEY, JSON.stringify(photo));
    else localStorage.removeItem(CACHED_PROFILE_PHOTO_KEY);
  } catch {
    // Storage full or unavailable: the photo still shows, it just isn't kept for offline.
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

const OFFLINE = "Χρειάζεται σύνδεση στο διαδίκτυο για να αλλάξει η φωτογραφία.";

function messageFor(status: number): string {
  if (status === 400 || status === 413 || status === 415) return "Δεν ήταν δυνατή η ανάγνωση της φωτογραφίας. Δοκιμάστε μια άλλη.";
  if (status === 429) return "Πολλές αλλαγές μαζί. Δοκιμάστε ξανά σε λίγο.";
  return "Η φωτογραφία δεν αποθηκεύτηκε. Δοκιμάστε ξανά.";
}

type Fetch = typeof fetch;

/** The server's photo against the phone's copy: unchanged, gone, or a new one. */
async function fetchLatest(etag: string | null, fetchImpl: Fetch): Promise<{ kind: "same" } | { kind: "none" } | { kind: "photo"; blob: Blob; etag: string | null }> {
  const response = await fetchImpl(ENDPOINT, { credentials: "include", cache: "no-store", headers: etag ? { "If-None-Match": etag } : {} });
  if (response.status === 304) return { kind: "same" };
  if (response.status === 404) return { kind: "none" };
  if (!response.ok) throw new Error(`profile photo: ${response.status}`);
  return { kind: "photo", blob: await response.blob(), etag: response.headers.get("ETag") };
}

/**
 * The person's profile photo on the Profile screen (2026-10-20). Shows the
 * phone's copy at once (offline too), then asks the server whether it
 * changed (another phone, a removal). Changing or removing it needs the
 * network, and says so when there's none.
 */
export function useProfilePhoto(profileId: string | null, fetchImpl: Fetch = fetch) {
  const [src, setSrc] = useState<string | null>(() => (profileId ? (readCache(profileId)?.dataUrl ?? null) : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The server's photo against the phone's copy, kept and returned: a data URL, null for none, undefined when unchanged. */
  const latest = useCallback(async (): Promise<string | null | undefined> => {
    if (!profileId) return undefined;
    const found = await fetchLatest(readCache(profileId)?.etag ?? null, fetchImpl);
    if (found.kind === "same") return undefined;
    if (found.kind === "none") {
      writeCache(null);
      return null;
    }
    const dataUrl = await blobToDataUrl(found.blob);
    writeCache({ profileId, etag: found.etag, dataUrl });
    return dataUrl;
  }, [profileId, fetchImpl]);

  const refresh = useCallback(async () => {
    try {
      const next = await latest();
      if (next !== undefined) setSrc(next);
    } catch {
      // Offline or a server hiccup: the phone's copy stays.
    }
  }, [latest]);

  // The phone's copy is read as the first state above; this only asks the server.
  useEffect(() => {
    let current = true;
    latest()
      .then((next) => {
        if (current && next !== undefined) setSrc(next);
      })
      .catch(() => {
        // Offline or a server hiccup: the phone's copy stays.
      });
    return () => {
      current = false;
    };
  }, [latest]);

  const upload = useCallback(
    async (file: File) => {
      if (!profileId) return;
      setError(null);
      setBusy(true);
      try {
        // The phone's own square; only a photo it can't read goes as it is (shrunk), for the server to judge.
        const square = await makePhotoThumbnail(file, UPLOAD_PX);
        const shrunk = square ? new File([square], "profile-photo.jpg", { type: "image/jpeg" }) : await shrinkPhotoForUpload(file);
        if (shrunk.size > MAX_MEDICATION_PHOTO_BYTES) {
          setError("Η φωτογραφία είναι πολύ μεγάλη. Δοκιμάστε μια άλλη.");
          return;
        }
        const form = new FormData();
        form.append("photo", shrunk);
        let response: Response;
        try {
          response = await fetchImpl(ENDPOINT, { method: "POST", credentials: "include", body: form });
        } catch {
          setError(OFFLINE);
          return;
        }
        if (!response.ok) {
          setError(messageFor(response.status));
          return;
        }
        // Kept as the phone's own centred square, tagged with the stored
        // photo's ETag, so it's never downloaded back; without one (a photo
        // the browser can't decode), the server's version is fetched.
        const { etag } = ((await response.json().catch(() => ({}))) as { etag?: string | null });
        const local = await makePhotoThumbnail(shrunk, LOCAL_PX);
        if (local) {
          const dataUrl = await blobToDataUrl(local);
          writeCache({ profileId, etag: etag ?? null, dataUrl });
          setSrc(dataUrl);
        } else {
          writeCache(null);
          await refresh();
        }
      } finally {
        setBusy(false);
      }
    },
    [profileId, fetchImpl, refresh],
  );

  const remove = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      let response: Response;
      try {
        response = await fetchImpl(ENDPOINT, { method: "DELETE", credentials: "include" });
      } catch {
        setError(OFFLINE);
        return;
      }
      if (!response.ok) {
        setError("Η φωτογραφία δεν αφαιρέθηκε. Δοκιμάστε ξανά.");
        return;
      }
      writeCache(null);
      setSrc(null);
    } finally {
      setBusy(false);
    }
  }, [fetchImpl]);

  return { src, busy, error, upload, remove };
}
