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

/**
 * POST /api/catalog/confirm-identifier body — OCR-fallback task spec §12:
 * only ever sent after real, explicit user confirmation in the UI (never
 * automatically from an OCR result alone). `catalogProductId` must be a
 * real UUID of the specific candidate the user picked — never inferred
 * server-side.
 */
export const catalogConfirmIdentifierBodySchema = z.object({
  type: z.enum(["EOF_CODE", "NHRN", "EAN13", "GTIN"]),
  value: z.string().trim().min(1, "Η τιμή του αναγνωριστικού είναι υποχρεωτική."),
  catalogProductId: z.string().uuid(),
});
export type CatalogConfirmIdentifierBody = z.infer<typeof catalogConfirmIdentifierBodySchema>;
