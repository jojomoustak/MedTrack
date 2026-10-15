"use client";

import { useSyncExternalStore } from "react";
import { getClientDb, type MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexiePhotoOutboxRepository } from "@/lib/medications/client/photo-outbox-repository";
import { onProfileCleared } from "@/lib/auth/client/profile-cleared-signal";
import { logger } from "@/lib/logging/logger";

export type MedicationPhotoThumbnailStatus = "checking" | "present" | "absent";

/**
 * Medication photo thumbnails for avatars (Today, the Calendar, the
 * Medications tab, a medication's header), rebuilt 2026-10-15.
 *
 * Every avatar used to fetch its medication's full photo from the server
 * (150 KB to several MB) and shrink it on the phone: one request per
 * medication, every ten minutes, again after every sign-in, and only the 30
 * most recently viewed kept. Slow for a few photos (Algofren after signing
 * in), unworkable for a hundred. Now:
 *
 * - The server keeps a ~10 KB thumbnail beside each photo and hands a
 *   device all the ones it lacks in one request (`syncPhotoThumbnails`,
 *   `app/api/medications/photo-thumbnails/route.ts`), at launch, after a
 *   restore, back in the foreground and after a photo upload.
 * - The phone keeps every thumbnail (`photoThumbnail` table; hundreds fit
 *   in a few MB) and reads them all into memory at start-up
 *   (`preloadPhotoThumbnails`), so avatars show their photo on the first
 *   frame and never touch the network.
 * - The full photo is fetched only by the photo screen.
 */

interface Entry {
  url: string;
  version: string | null;
}

const urls = new Map<string, Entry>();
const listeners = new Set<() => void>();
let preloaded = false;
let preload: Promise<void> | null = null;
let syncing: Promise<void> | null = null;
let syncAgain = false;
/** Bumped at sign-out: a sync that started before it must not write the previous profile's thumbnails back. */
let epoch = 0;
/** Photos set or removed on this device while a sync runs: that sync's (older) answer about them is ignored. */
const changedDuringSync = new Set<string>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setUrl(userMedicationId: string, blob: Blob, version: string | null): void {
  const previous = urls.get(userMedicationId);
  if (previous) URL.revokeObjectURL(previous.url);
  urls.set(userMedicationId, { url: URL.createObjectURL(blob), version });
}

function dropUrl(userMedicationId: string): boolean {
  const previous = urls.get(userMedicationId);
  if (!previous) return false;
  URL.revokeObjectURL(previous.url);
  urls.delete(userMedicationId);
  return true;
}

/**
 * The local database, or null where there is none (a browser with storage
 * blocked, a test without IndexedDB): thumbnails are a nicety, so their
 * absence never breaks a screen.
 */
function databaseOr(db: MedTrackingDexie | undefined): MedTrackingDexie | null {
  try {
    return db ?? getClientDb();
  } catch {
    return null;
  }
}

/** Reads every stored thumbnail into memory, once per page (`app/(app)/layout.tsx`). Never throws. */
export function preloadPhotoThumbnails(db?: MedTrackingDexie): Promise<void> {
  preload ??= Promise.resolve()
    .then(() => databaseOr(db)?.photoThumbnail.toArray() ?? [])
    .then((rows) => {
      for (const row of rows) if (!urls.has(row.userMedicationId)) setUrl(row.userMedicationId, row.blob, row.version);
    })
    .catch((err: unknown) => logger.warn("photo_thumbnails.preload_failed", { errorName: err instanceof Error ? err.name : "unknown" }))
    .finally(() => {
      preloaded = true;
      emit();
    });
  return preload;
}

/** A thumbnail made on this device (a photo just taken or picked), shown at once; the next sync confirms it. */
export async function setLocalPhotoThumbnail(userMedicationId: string, thumbnail: Blob | null, db?: MedTrackingDexie): Promise<void> {
  if (!thumbnail) return;
  if (syncing) changedDuringSync.add(userMedicationId);
  setUrl(userMedicationId, thumbnail, null);
  emit();
  await databaseOr(db)
    ?.photoThumbnail.put({ userMedicationId, version: null, blob: thumbnail, updatedAt: new Date().toISOString() })
    .catch(() => {});
}

/** The photo was removed (or the server says there is none). */
export async function removeLocalPhotoThumbnail(userMedicationId: string, db?: MedTrackingDexie): Promise<void> {
  if (syncing) changedDuringSync.add(userMedicationId);
  if (dropUrl(userMedicationId)) emit();
  await databaseOr(db)
    ?.photoThumbnail.delete(userMedicationId)
    .catch(() => {});
}

/** Signed out: the thumbnails in memory belong to the profile that left (the table is cleared with the rest of its data). */
export function clearPhotoThumbnailsInMemory(): void {
  epoch++;
  syncAgain = false;
  for (const id of [...urls.keys()]) dropUrl(id);
  preload = null;
  preloaded = false;
  emit();
}

if (typeof window !== "undefined") onProfileCleared(clearPhotoThumbnailsInMemory);

interface ThumbnailsResponse {
  photos: { userMedicationId: string; version: string; data?: string }[];
  more: boolean;
}

function decodeBase64Jpeg(data: string): Blob {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/jpeg" });
}

/** Most rounds per sync (each up to 40 thumbnails): enough for any real account, a stop for a misbehaving server. */
const MAX_ROUNDS = 25;

/**
 * Brings this device's thumbnails in line with the server's photos in as
 * few requests as possible: sends the versions it holds, stores the
 * thumbnails it gets back, forgets the ones whose photo is gone. A photo
 * change still waiting to upload from this device is left alone either way
 * (the server doesn't know about it yet), and so is one made on this device
 * while the sync ran. Asked again while running (a photo was just uploaded),
 * it runs once more afterwards, so that change is picked up. Stops at a
 * sign-out. One sync at a time; never throws.
 */
export function syncPhotoThumbnails(deps: { db?: MedTrackingDexie; fetchImpl?: typeof fetch } = {}): Promise<void> {
  if (syncing) {
    syncAgain = true;
    return syncing;
  }
  syncing = (async () => {
    do {
      syncAgain = false;
      changedDuringSync.clear();
      await runSync(deps);
    } while (syncAgain);
  })().finally(() => {
    syncing = null;
    changedDuringSync.clear();
  });
  return syncing;
}

async function runSync(deps: { db?: MedTrackingDexie; fetchImpl?: typeof fetch }): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const db = databaseOr(deps.db);
  if (!db) return;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const startedEpoch = epoch;
  // Signed out since this started, or a newer change on this device: leave it.
  const stillMine = () => epoch === startedEpoch;
  const skip = (id: string) => changedDuringSync.has(id);
  try {
    await preloadPhotoThumbnails(db);
    const outbox = new DexiePhotoOutboxRepository(db);
    const listed = new Set<string>();
    let changed = false;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const stored = await db.photoThumbnail.toArray();
      const known: Record<string, string> = {};
      for (const row of stored) if (row.version) known[row.userMedicationId] = row.version;

      const response = await fetchImpl("/api/medications/photo-thumbnails", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ known }),
      });
      if (!response.ok || !stillMine()) return;
      const body = (await response.json()) as ThumbnailsResponse;

      let received = 0;
      for (const photo of body.photos) {
        listed.add(photo.userMedicationId);
        if (!photo.data) continue;
        received++;
        if (skip(photo.userMedicationId) || (await outbox.get(photo.userMedicationId))) continue;
        const blob = decodeBase64Jpeg(photo.data);
        if (!stillMine()) return;
        await db.photoThumbnail.put({ userMedicationId: photo.userMedicationId, version: photo.version, blob, updatedAt: new Date().toISOString() });
        setUrl(photo.userMedicationId, blob, photo.version);
        changed = true;
      }
      // "More" but nothing new this round (thumbnails the server can't make
      // right now): asking again would only bring the same answer.
      if (!body.more || received === 0) break;
    }

    for (const row of await db.photoThumbnail.toArray()) {
      if (listed.has(row.userMedicationId) || skip(row.userMedicationId) || (await outbox.get(row.userMedicationId))) continue;
      if (!stillMine()) return;
      await db.photoThumbnail.delete(row.userMedicationId);
      dropUrl(row.userMedicationId);
      changed = true;
    }
    if (changed) emit();
  } catch (err) {
    logger.warn("photo_thumbnails.sync_failed", { errorName: err instanceof Error ? err.name : "unknown" });
  }
}

/**
 * The avatar's photo: from memory, never the network. `checking` only until
 * the start-up preload has run; after that a medication without a stored
 * thumbnail has no photo (or one the next sync will bring).
 */
export function useMedicationPhotoThumbnail(userMedicationId: string): { status: MedicationPhotoThumbnailStatus; url: string | null } {
  const url = useSyncExternalStore(
    subscribe,
    () => urls.get(userMedicationId)?.url ?? null,
    () => null,
  );
  const ready = useSyncExternalStore(
    subscribe,
    () => preloaded,
    () => false,
  );
  if (url) return { status: "present", url };
  return { status: ready ? "absent" : "checking", url: null };
}

/** Test seam. */
export function __resetPhotoChecksForTests(): void {
  urls.clear();
  listeners.clear();
  preload = null;
  preloaded = false;
  syncing = null;
  syncAgain = false;
  changedDuringSync.clear();
}
