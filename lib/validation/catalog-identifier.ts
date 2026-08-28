import { z } from "zod";

/**
 * GET /api/catalog/resolve-identifier?type=&value= — the GTIN-resolution
 * task's real multi-identifier lookup (spec §3/§19), distinct from the
 * older `/api/catalog/lookup?gtin=|eofCode=` route (which queries the
 * single-valued `medication_catalog_product.gtin`/`eof_code` columns and
 * cannot represent `CONFLICT`). `type` mirrors
 * `medication_identifier.identifier_type`'s CHECK constraint exactly.
 */
export const catalogResolveIdentifierQuerySchema = z.object({
  type: z.enum(["EOF_CODE", "NHRN", "EAN13", "GTIN"]),
  value: z.string().trim().min(1, "Η τιμή του αναγνωριστικού είναι υποχρεωτική."),
});
export type CatalogResolveIdentifierQuery = z.infer<typeof catalogResolveIdentifierQuerySchema>;
