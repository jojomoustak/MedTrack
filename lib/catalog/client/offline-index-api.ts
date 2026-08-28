import type { OfflineIndexEntry } from "@/lib/domain/offline-index";

export class OfflineIndexApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OfflineIndexApiError";
  }
}

export interface OfflineIndexManifestResponse {
  version: string;
  recordCount: number;
  generatedAt: string;
}

export interface OfflineIndexResponse {
  manifest: OfflineIndexManifestResponse;
  entries: OfflineIndexEntry[];
}

/** GET /api/catalog/offline-index/manifest — the cheap freshness check (spec §16), fetched before ever downloading the full payload. */
export async function fetchOfflineIndexManifest(fetchImpl: typeof fetch = fetch): Promise<OfflineIndexManifestResponse> {
  const response = await fetchImpl("/api/catalog/offline-index/manifest", { credentials: "include", cache: "no-store" });
  if (!response.ok) {
    throw new OfflineIndexApiError(`Offline index manifest fetch failed with status ${response.status}`, response.status);
  }
  return response.json() as Promise<OfflineIndexManifestResponse>;
}

/** GET /api/catalog/offline-index — the full payload, fetched only once the manifest shows the locally-stored version is stale. */
export async function fetchOfflineIndex(fetchImpl: typeof fetch = fetch): Promise<OfflineIndexResponse> {
  const response = await fetchImpl("/api/catalog/offline-index", { credentials: "include", cache: "no-store" });
  if (!response.ok) {
    throw new OfflineIndexApiError(`Offline index fetch failed with status ${response.status}`, response.status);
  }
  return response.json() as Promise<OfflineIndexResponse>;
}
