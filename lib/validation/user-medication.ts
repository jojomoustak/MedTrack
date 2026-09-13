import { z } from "zod";
import { clientMutationIdSchema, quantityUnitSchema, quantityValueSchema, uuidSchema } from "@/lib/validation/common";

const treatmentStateSchema = z.enum(["active", "completed", "paused", "discontinued"]);

/**
 * Shared by the client form (Phase 3 §2.4's "details step") and the
 * server mutation handler — one schema, one place the
 * `chk_catalog_or_manual` invariant (ADR-004: catalog match OR a manual
 * name, never neither) is enforced before it ever reaches the database.
 */
export const createUserMedicationSchema = z
  .object({
    id: uuidSchema,
    clientMutationId: clientMutationIdSchema,
    catalogProductId: uuidSchema.nullable(),
    customName: z.string().trim().min(1).max(200).nullable(),
    customForm: quantityUnitSchema.nullable(),
    customStrengthValue: z.string().trim().max(30).nullable(),
    customStrengthUnit: z.string().trim().max(20).nullable(),
    treatmentState: treatmentStateSchema.default("active"),
    inventoryUnit: quantityUnitSchema,
    lowStockThresholdValue: z.string().trim().max(30).nullable().optional(),
    expiryWarningDays: z.int().nonnegative().max(3650).default(30),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((data) => data.catalogProductId !== null || (data.customName !== null && data.customName.trim().length > 0), {
    message: "Επιλέξτε φάρμακο από την αναζήτηση ή εισαγάγετε όνομα με το χέρι.",
    path: ["customName"],
  });

export type CreateUserMedicationInput = z.infer<typeof createUserMedicationSchema>;

/**
 * Every field optional — `/medications/[id]/edit` sends only what it's
 * actually changing, same "omitted means untouched" convention as
 * `updatePurchaseListItemSchema` (Phase 13). `customName`/`customForm`/
 * `customStrengthValue`/`customStrengthUnit` are never sent at all for a
 * catalog-linked medication (the edit form hides those fields for that
 * case — see `UserMedicationPatch`'s own doc), but are still valid here
 * for the manual-entry case.
 */
export const updateUserMedicationSchema = z.object({
  customName: z.string().trim().min(1).max(200).nullable().optional(),
  customForm: quantityUnitSchema.nullable().optional(),
  customStrengthValue: z.string().trim().max(30).nullable().optional(),
  customStrengthUnit: z.string().trim().max(20).nullable().optional(),
  treatmentState: treatmentStateSchema.optional(),
  inventoryUnit: quantityUnitSchema.optional(),
  lowStockThresholdValue: z.string().trim().max(30).nullable().optional(),
  expiryWarningDays: z.int().nonnegative().max(3650).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type UpdateUserMedicationInput = z.infer<typeof updateUserMedicationSchema>;

/** `quantityValueSchema` re-exported for form-level numeric validation before formatting into the string field the wire schema expects. */
export { quantityValueSchema };
