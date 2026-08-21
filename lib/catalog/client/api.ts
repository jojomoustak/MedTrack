import type { CatalogProduct } from "@/lib/domain/catalog";

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
