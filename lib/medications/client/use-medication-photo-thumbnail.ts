"use client";

import { useEffect, useState } from "react";
import { fetchMedicationPhoto } from "@/lib/medications/client/photo-api";
import { DexiePhotoCacheRepository } from "@/lib/medications/client/photo-cache-repository";
import { DexiePhotoOutboxRepository } from "@/lib/medications/client/photo-outbox-repository";
import { makePhotoThumbnail } from "@/lib/medications/client/photo-thumbnail";
import type { PhotoCacheEntry } from "@/lib/domain/repositories";

export type MedicationPhotoThumbnailStatus = "checking" | "present" | "absent";

/**
 * How long a server answer stands (2026-10-09). Every avatar on every
 * screen asked the server again on each visit — four medications on Today
 * meant four round trips per visit, nearly all answering "no photo".
 * Photos are added and removed through this app, which updates the local
 * cache itself, so a recent answer is still right on this device; another
 * device's change shows up within this window.
 */
const SERVER_CHECK_VALID_MS = 10 * 60_000;
const lastServerCheck = new Map<string, number>();

/**
 * Thumbnail URLs, one per medication for the life of the page: a screen
 * opened again shows the photo on its first frame, with nothing to read
 * from storage or decode. `cachedAt` tells a URL apart from a newer copy's.
 * Never revoked — an `<img>` may still be showing it, and a thumbnail is
 * only a few KB.
 */
const thumbnailUrls = new Map<string, { url: string; cachedAt: string | undefined }>();

/** A photo was added, replaced or removed on this device: avatars re-read it, and the next check asks the server again. */
export function forgetPhotoThumbnail(userMedicationId: string): void {
  thumbnailUrls.delete(userMedicationId);
  lastServerCheck.delete(userMedicationId);
}

/** Test seam. */
export function __resetPhotoChecksForTests(): void {
  lastServerCheck.clear();
  thumbnailUrls.clear();
}

/**
 * The avatar's photo. UX feedback (2026-09-26): the original version
 * fetched over the network on every single mount, even for a photo
 * already seen on a previous visit — cache-first here (the same
 * `DexiePhotoCacheRepository` `MedicationPhotoAttach` already uses, see
 * its own header doc for why photos have no offline-sync story but do have
 * this local view cache), with the network call only ever revalidating
 * quietly in the background.
 *
 * Shows a small thumbnail, never the full photo (2026-10-09): decoding a
 * phone photo for a 60 px circle on every screen was what made photos
 * slow. A copy cached before thumbnails existed gets one made on first
 * view. The background check sends the cached copy's version, so an
 * unchanged photo is never downloaded again.
 */
export function useMedicationPhotoThumbnail(userMedicationId: string): { status: MedicationPhotoThumbnailStatus; url: string | null } {
  const [state, setState] = useState<{ status: MedicationPhotoThumbnailStatus; url: string | null }>(() => {
    const known = thumbnailUrls.get(userMedicationId);
    return known ? { status: "present", url: known.url } : { status: "checking", url: null };
  });

  useEffect(() => {
    let cancelled = false;
    const cache = new DexiePhotoCacheRepository();

    function show(url: string | null) {
      if (cancelled) return;
      setState((prev) => (url ? (prev.url === url ? prev : { status: "present", url }) : prev.status === "absent" ? prev : { status: "absent", url: null }));
    }

    async function thumbnailUrlFor(entry: PhotoCacheEntry): Promise<string> {
      const remembered = thumbnailUrls.get(userMedicationId);
      if (remembered && remembered.cachedAt === entry.cachedAt) return remembered.url;
      let thumbnail = entry.thumbnail ?? null;
      if (!thumbnail) {
        thumbnail = await makePhotoThumbnail(entry.blob);
        if (thumbnail) await cache.putThumbnail(userMedicationId, thumbnail).catch(() => {});
      }
      const url = URL.createObjectURL(thumbnail ?? entry.blob);
      thumbnailUrls.set(userMedicationId, { url, cachedAt: entry.cachedAt });
      return url;
    }

    async function load() {
      const cached = await cache.get(userMedicationId);
      if (cached) {
        show(await thumbnailUrlFor(cached));
        void cache.touch(userMedicationId);
      }

      const checkedAt = lastServerCheck.get(userMedicationId);
      if (checkedAt !== undefined && Date.now() - checkedAt < SERVER_CHECK_VALID_MS) {
        if (!cached) show(null);
        return;
      }
      // A photo waiting to upload (or to be removed) is ahead of the server — don't let the server's answer overwrite it.
      if (await new DexiePhotoOutboxRepository().get(userMedicationId)) return;

      try {
        const result = await fetchMedicationPhoto(userMedicationId, fetch, { etag: cached?.etag });
        if (result && "notModified" in result) {
          lastServerCheck.set(userMedicationId, Date.now());
          return;
        }
        if (!result) {
          await cache.remove(userMedicationId);
          thumbnailUrls.delete(userMedicationId);
          lastServerCheck.set(userMedicationId, Date.now());
          show(null);
          return;
        }
        const thumbnail = await makePhotoThumbnail(result.blob);
        await cache.put({ userMedicationId, blob: result.blob, contentType: result.blob.type || "application/octet-stream", thumbnail, etag: result.etag });
        // Only once the local cache agrees with the answer — a later visit trusts the cache instead of asking.
        lastServerCheck.set(userMedicationId, Date.now());
        const stored = await cache.get(userMedicationId);
        if (stored) show(await thumbnailUrlFor(stored));
      } catch {
        // Offline/transient failure: keep showing a cached copy if there
        // was one; otherwise fall back to the glyph rather than leaving the
        // row stuck on a loading skeleton forever.
        if (!cached) show(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [userMedicationId]);

  return state;
}
