import { z } from "zod";
import { clientMutationIdSchema, currencySchema, moneyCentsSchema, quantityUnitSchema, quantityValueSchema, uuidSchema, versionSchema } from "@/lib/validation/common";

export const purchaseListItemStatusSchema = z.enum(["pending", "purchased", "removed"]);

/**
 * Create payload (Phase 2 §2.12's `chk_item_has_label`) — at least one of
 * `userMedicationId`/`label` must be present; enforced here as well as by
 * the database, so a bad input fails fast client-side instead of round
 * tripping to find out.
 */
export const createPurchaseListItemSchema = z
  .object({
    id: uuidSchema,
    clientMutationId: clientMutationIdSchema,
    purchaseListId: uuidSchema,
    userMedicationId: uuidSchema.nullable().optional(),
    label: z.string().trim().min(1).max(200).nullable().optional(),
    quantityValue: quantityValueSchema.nullable().optional(),
    quantityUnit: quantityUnitSchema.nullable().optional(),
    estimatedUnitPriceCents: moneyCentsSchema.nullable().optional(),
    currency: currencySchema.optional(),
  })
  .refine((v) => Boolean(v.userMedicationId) || Boolean(v.label), {
    message: "A purchase list item needs either a linked medication or a label.",
  });
export type CreatePurchaseListItemInput = z.infer<typeof createPurchaseListItemSchema>;

/**
 * Every field optional — a caller sends only what it's actually changing
 * (label edit, price entry, status transition, ...), and an omitted field
 * must mean "leave it alone," not "reset to a default." `currency` can't
 * reuse `currencySchema` here for exactly that reason: its `.default("EUR")`
 * would make Zod fill in `"EUR"` on every parse even when the caller never
 * touched currency at all, indistinguishable from an explicit change —
 * this schema needs a defaultless variant instead.
 */
export const updatePurchaseListItemSchema = z.object({
  label: z.string().trim().min(1).max(200).nullable().optional(),
  quantityValue: quantityValueSchema.nullable().optional(),
  quantityUnit: quantityUnitSchema.nullable().optional(),
  estimatedUnitPriceCents: moneyCentsSchema.nullable().optional(),
  actualPaidPriceCents: moneyCentsSchema.nullable().optional(),
  currency: z.string().length(3).optional(),
  status: purchaseListItemStatusSchema.optional(),
  purchasedAt: z.iso.datetime({ offset: true }).nullable().optional(),
});
export type UpdatePurchaseListItemInput = z.infer<typeof updatePurchaseListItemSchema>;

/** Optimistic-concurrency envelope every update mutation carries, same convention as `PurchaseList`'s own `rename`. */
export const updatePurchaseListItemRequestSchema = z.object({
  id: uuidSchema,
  clientMutationId: clientMutationIdSchema,
  baseVersion: versionSchema,
  patch: updatePurchaseListItemSchema,
});
export type UpdatePurchaseListItemRequest = z.infer<typeof updatePurchaseListItemRequestSchema>;
