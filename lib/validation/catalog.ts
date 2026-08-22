import { z } from "zod";

/** GET /api/catalog/search?q=&limit=&offset= */
export const catalogSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, "Πληκτρολογήστε τουλάχιστον 2 χαρακτήρες.")
    .max(100),
  limit: z.coerce.number().int().positive().max(50).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;

/**
 * GET /api/catalog/lookup?gtin= — the scan flow's server-side lookup
 * (Phase 1 §7), hit only when the local cache misses and the device is
 * online. `gtin` is expected already normalized to GS1's 14-digit form
 * (`lib/domain/gs1.ts`) by the time it reaches this endpoint.
 */
export const catalogLookupQuerySchema = z.object({
  gtin: z
    .string()
    .trim()
    .regex(/^\d{14}$/, "Το GTIN πρέπει να είναι 14 ψηφία."),
});
export type CatalogLookupQuery = z.infer<typeof catalogLookupQuerySchema>;
