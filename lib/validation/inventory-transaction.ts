import { z } from "zod";
import { clientMutationIdSchema, quantityUnitSchema, signedQuantityDeltaSchema, uuidSchema } from "@/lib/validation/common";
import { INVENTORY_TRANSACTION_SOURCES, INVENTORY_TRANSACTION_TYPES, requiresDoseEventId } from "@/lib/domain/inventory-transaction";

const transactionTypeSchema = z.enum(INVENTORY_TRANSACTION_TYPES);
const transactionSourceSchema = z.enum(INVENTORY_TRANSACTION_SOURCES);

/**
 * The ledger is append-only (ADR-010) — this is the only mutation shape
 * for `medicationInventoryTransaction`; there is no update/delete schema,
 * matching `DoseEvent`'s idempotent-by-id, never-optimistic-concurrency
 * convention. `chk_dose_txn_has_event` (Phase 2 §2.9) is enforced here via
 * `requiresDoseEventId`, the same pure function the domain/server layers
 * use, so client and server can never disagree about which transaction
 * types require a `doseEventId`.
 */
export const createInventoryTransactionSchema = z
  .object({
    id: uuidSchema,
    clientMutationId: clientMutationIdSchema,
    userMedicationId: uuidSchema,
    packageId: uuidSchema.nullable(),
    transactionType: transactionTypeSchema,
    quantityDelta: signedQuantityDeltaSchema,
    quantityUnit: quantityUnitSchema,
    doseEventId: uuidSchema.nullable(),
    occurredAt: z.iso.datetime({ offset: true }),
    source: transactionSourceSchema,
    note: z.string().trim().max(500).nullable(),
  })
  .refine((data) => requiresDoseEventId(data.transactionType) === (data.doseEventId !== null), {
    message: "doseEventId is required for dose_taken/dose_reversed transactions, and must be absent otherwise.",
    path: ["doseEventId"],
  });

export type CreateInventoryTransactionInput = z.infer<typeof createInventoryTransactionSchema>;
