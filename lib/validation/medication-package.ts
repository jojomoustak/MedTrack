import { z } from "zod";
import { clientMutationIdSchema, quantityUnitSchema, quantityValueSchema, uuidSchema, versionSchema } from "@/lib/validation/common";
import { MEDICATION_PACKAGE_SOURCES, MEDICATION_PACKAGE_STATUSES } from "@/lib/domain/medication-package";

const packageSourceSchema = z.enum(MEDICATION_PACKAGE_SOURCES);
const packageStatusSchema = z.enum(MEDICATION_PACKAGE_STATUSES);

/** Shared by the client package-add form and the server mutation handler, same convention as `createMedicationScheduleSchema`. `status`/`openedAt` are deliberately absent — a package is always created `unopened` (`createMedicationPackageInputSchema` below matches `CreateMedicationPackageInput`'s `Omit`), the domain layer never lets a client assert an already-opened package into existence. */
export const createMedicationPackageSchema = z.object({
  id: uuidSchema,
  clientMutationId: clientMutationIdSchema,
  userMedicationId: uuidSchema,
  source: packageSourceSchema,
  gtin: z.string().trim().max(64).nullable(),
  batchNumber: z.string().trim().max(64).nullable(),
  serialNumber: z.string().trim().max(64).nullable(),
  expiryDate: z.iso.date().nullable(),
  receivedDate: z.iso.date(),
  initialQuantityValue: quantityValueSchema,
  quantityUnit: quantityUnitSchema,
});

export type CreateMedicationPackageInput = z.infer<typeof createMedicationPackageSchema>;

export const updateMedicationPackageSchema = z.object({
  id: uuidSchema,
  clientMutationId: clientMutationIdSchema,
  baseVersion: versionSchema,
  batchNumber: z.string().trim().max(64).nullable().optional(),
  serialNumber: z.string().trim().max(64).nullable().optional(),
  expiryDate: z.iso.date().nullable().optional(),
  status: packageStatusSchema.optional(),
  openedAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

export type UpdateMedicationPackageInput = z.infer<typeof updateMedicationPackageSchema>;
