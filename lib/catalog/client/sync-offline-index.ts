import type { OfflineIndexRepository } from "@/lib/domain/repositories";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { fetchOfflineIndex, fetchOfflineIndexManifest } from "@/lib/catalog/client/offline-index-api";
import type { NetworkState } from "@/lib/sync/client/network";
import { logger } from "@/lib/logging/logger";
import { notifyOfflineIndexUpdated } from "@/lib/catalog/client/offline-index-signal";

export type SyncOfflineIndexOutcome =
  | { status: "up-to-date"; version: string }
  | { status: "updated"; version: string; recordCount: number }
  | { status: "skipped-offline" }
  | { status: "failed"; reason: string };

/**
 * Default checksum: SHA-256 over the exact same serialization the server
 * used to compute `manifest.version` (`lib/catalog/server/offline-index.ts`
 * — `JSON.stringify(entries)`, entries pre-sorted by id for determinism).
 * Real content verification (spec §18: "validate checksum"), not a
 * trust-the-server shortcut — a corrupted or truncated download will not
 * match and is rejected before anything is written locally.
 */
async function defaultComputeSha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Checks the server's offline-index manifest against what's stored
 * locally and, only if different, downloads and atomically installs the
 * full index (spec §16-18). Safe to call on every app start / reconnect
 * (the manifest check is cheap) — it does NOT redownload the full
 * multi-megabyte payload every time, only when content actually changed.
 *
 * Every failure mode (offline, network error, record-count mismatch,
 * checksum mismatch) returns a typed outcome rather than throwing, and
 * — critically — never calls `repository.replaceAll` unless validation
 * fully passed, so a failed sync always leaves the previous local index
 * (if any) completely untouched (spec §18's core failure-safety guarantee).
 */
export async function syncOfflineIndex(
  network: NetworkState,
  deps: {
    repository?: OfflineIndexRepository;
    fetchImpl?: typeof fetch;
    computeSha256Hex?: (input: string) => Promise<string>;
  } = {},
): Promise<SyncOfflineIndexOutcome> {
  if (network !== "online") return { status: "skipped-offline" };

  const repository = deps.repository ?? new DexieOfflineIndexRepository();
  const computeSha256Hex = deps.computeSha256Hex ?? defaultComputeSha256Hex;

  try {
    const [remoteManifest, localManifest] = await Promise.all([fetchOfflineIndexManifest(deps.fetchImpl), repository.getManifest()]);

    if (localManifest && localManifest.version === remoteManifest.version) {
      return { status: "up-to-date", version: remoteManifest.version };
    }

    const { manifest, entries } = await fetchOfflineIndex(deps.fetchImpl);

    if (manifest.recordCount !== entries.length) {
      const reason = `record count mismatch: manifest says ${manifest.recordCount}, payload has ${entries.length}`;
      logger.warn("catalog.offline_index.sync_rejected", { reason });
      return { status: "failed", reason };
    }

    const actualHash = await computeSha256Hex(JSON.stringify(entries));
    if (actualHash !== manifest.version) {
      const reason = "checksum mismatch — downloaded payload does not match the manifest's declared version";
      logger.warn("catalog.offline_index.sync_rejected", { reason });
      return { status: "failed", reason };
    }

    await repository.replaceAll({ version: manifest.version, recordCount: manifest.recordCount, generatedAt: manifest.generatedAt, syncedAt: new Date().toISOString() }, entries);

    logger.info("catalog.offline_index.synced", { version: manifest.version, recordCount: manifest.recordCount });
    // Tells any already-rendered screen that resolved a catalogProductId
    // before this sync finished (module doc above) to look again now.
    notifyOfflineIndexUpdated();
    return { status: "updated", version: manifest.version, recordCount: manifest.recordCount };
  } catch (err) {
    const reason = (err as Error).message;
    logger.warn("catalog.offline_index.sync_failed", { reason });
    return { status: "failed", reason };
  }
}
