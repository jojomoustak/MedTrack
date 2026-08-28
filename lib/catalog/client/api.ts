import type { CatalogIdentifierType, CatalogProduct, IdentifierResolution } from "@/lib/domain/catalog";

export class CatalogApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CatalogApiError";
  }
}

export interface CatalogSearchResponse {
  results: CatalogProduct[];
  query: string;
  limit: number;
  offset: number;
}

export async function searchCatalog(
  query: string,
  fetchImpl: typeof fetch = fetch,
  options: { limit?: number; offset?: number } = {},
): Promise<CatalogSearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));

  const response = await fetchImpl(`/api/catalog/search?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new CatalogApiError(`Catalog search failed with status ${response.status}`, response.status);
  }
  return response.json() as Promise<CatalogSearchResponse>;
}

export interface CatalogLookupResponse {
  product: CatalogProduct | null;
  gtin: string | null;
  eofCode: string | null;
}

/** GET /api/catalog/lookup?gtin= — the scan flow's server-side fallback once the local cache misses (`lib/catalog/client/lookup-gtin.ts`). `gtin` must already be normalized (14-digit, `lib/domain/gs1.ts`). */
export async function lookupCatalogByGtin(gtin: string, fetchImpl: typeof fetch = fetch): Promise<CatalogLookupResponse> {
  const params = new URLSearchParams({ gtin });
  const response = await fetchImpl(`/api/catalog/lookup?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new CatalogApiError(`Catalog lookup failed with status ${response.status}`, response.status);
  }
  return response.json() as Promise<CatalogLookupResponse>;
}

/**
 * GET /api/catalog/lookup?eofCode= — Path A's server-side fallback
 * (medication-resolution-architecture.md §2.5), the `lookupEofCode`
 * analogue of `lookupCatalogByGtin` above. `eofCode` must already be the
 * decoded 9-digit form (`lib/domain/greek-national-barcode.ts`), leading
 * zeros preserved.
 */
export async function lookupCatalogByEofCode(eofCode: string, fetchImpl: typeof fetch = fetch): Promise<CatalogLookupResponse> {
  const params = new URLSearchParams({ eofCode });
  const response = await fetchImpl(`/api/catalog/lookup?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new CatalogApiError(`Catalog lookup failed with status ${response.status}`, response.status);
  }
  return response.json() as Promise<CatalogLookupResponse>;
}

/**
 * GET /api/catalog/resolve-identifier?type=&value= — the real GTIN-
 * resolution path's server-side fallback (GTIN-resolution task spec
 * §3/§19), returning the full three-state `IdentifierResolution`
 * (`EXACT`/`CONFLICT`/`VALID_IDENTIFIER_UNRESOLVED`) rather than the
 * older `lookupCatalogByGtin`'s single product-or-null, which cannot
 * represent a genuine cross-product conflict.
 */
export async function resolveCatalogIdentifier(type: CatalogIdentifierType, value: string, fetchImpl: typeof fetch = fetch): Promise<IdentifierResolution> {
  const params = new URLSearchParams({ type, value });
  const response = await fetchImpl(`/api/catalog/resolve-identifier?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new CatalogApiError(`Catalog identifier resolution failed with status ${response.status}`, response.status);
  }
  return response.json() as Promise<IdentifierResolution>;
}
