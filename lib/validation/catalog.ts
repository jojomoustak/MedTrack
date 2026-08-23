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
 * GET /api/catalog/lookup?gtin=|eofCode= — the scan flow's server-side
 * lookup (Phase 1 §7; Path A added per medication-resolution-architecture.md
 * §2.5), hit only when the local cache misses and the device is online.
 * Exactly one of `gtin` (GS1 GTIN path, already normalized to 14 digits by
 * `lib/domain/gs1.ts`) or `eofCode` (Greek national EAN-13 path, the
 * 9-digit code `lib/domain/greek-national-barcode.ts` decodes) must be
 * given — never both, never neither, since they're two structurally
 * different resolution keys, not interchangeable synonyms.
 */
export const catalogLookupQuerySchema = z
  .object({
    gtin: z
      .string()
      .trim()
      .regex(/^\d{14}$/, "Το GTIN πρέπει να είναι 14 ψηφία.")
      .optional(),
    eofCode: z
      .string()
      .trim()
      .regex(/^\d{9}$/, "Ο κωδικός ΕΟΦ πρέπει να είναι 9 ψηφία.")
      .optional(),
  })
  .refine((v) => Boolean(v.gtin) !== Boolean(v.eofCode), {
    message: "Δώστε είτε gtin είτε eofCode, όχι και τα δύο ή κανένα.",
  });
export type CatalogLookupQuery = z.infer<typeof catalogLookupQuerySchema>;
