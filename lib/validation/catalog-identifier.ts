import { z } from "zod";

const identifierType = z.enum(["EOF_CODE", "NHRN", "EAN13", "GTIN"]);

/**
 * The value's shape per type: a GTIN exactly as the scanner normalizes it
 * (14 digits, `lib/domain/gs1.ts`), an EAN-13 as 13 digits, other codes
 * short and alphanumeric. Was any non-empty string; tightened when people's
 * identifications started being shared (security review, 2026-10-15), so
 * nothing malformed or oversized can reach the shared suggestions.
 */
const VALUE_PATTERN: Record<z.infer<typeof identifierType>, RegExp> = {
  GTIN: /^\d{14}$/,
  EAN13: /^\d{13}$/,
  EOF_CODE: /^[0-9A-Za-z]{1,20}$/,
  NHRN: /^[0-9A-Za-z]{1,20}$/,
};

function checkValueShape(input: { type: z.infer<typeof identifierType>; value: string }, ctx: z.RefinementCtx) {
  if (!VALUE_PATTERN[input.type].test(input.value)) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "Μη έγκυρη τιμή αναγνωριστικού." });
  }
}

/**
 * GET /api/catalog/resolve-identifier?type=&value= — the GTIN-resolution
 * task's real multi-identifier lookup (spec §3/§19), distinct from the
 * older `/api/catalog/lookup?gtin=|eofCode=` route (which queries the
 * single-valued `medication_catalog_product.gtin`/`eof_code` columns and
 * cannot represent `CONFLICT`). `type` mirrors
 * `medication_identifier.identifier_type`'s CHECK constraint exactly.
 */
export const catalogResolveIdentifierQuerySchema = z
  .object({
    type: identifierType,
    value: z.string().trim().min(1, "Η τιμή του αναγνωριστικού είναι υποχρεωτική."),
    /** Sent by clients that show a `SUGGESTED` answer as such (2026-10-15); without it, none is returned. */
    suggestions: z.literal("1").optional(),
  })
  .superRefine(checkValueShape);
export type CatalogResolveIdentifierQuery = z.infer<typeof catalogResolveIdentifierQuerySchema>;

/**
 * POST /api/catalog/confirm-identifier body — OCR-fallback task spec §12:
 * only ever sent after real, explicit user confirmation in the UI (never
 * automatically from an OCR result alone). `catalogProductId` must be a
 * real UUID of the specific candidate the user picked — never inferred
 * server-side.
 */
export const catalogConfirmIdentifierBodySchema = z
  .object({
    type: identifierType,
    value: z.string().trim().min(1, "Η τιμή του αναγνωριστικού είναι υποχρεωτική."),
    catalogProductId: z.string().uuid(),
  })
  .superRefine(checkValueShape);
export type CatalogConfirmIdentifierBody = z.infer<typeof catalogConfirmIdentifierBodySchema>;
