import { z } from "zod";
import { clientMutationIdSchema, quantityUnitSchema, quantityValueSchema, uuidSchema } from "@/lib/validation/common";
import { DOSE_EVENT_SOURCES, DOSE_EVENT_STATUSES } from "@/lib/domain/dose-event";

const doseEventStatusSchema = z.enum(DOSE_EVENT_STATUSES);

export const createDoseEventSchema = z.object({
  id: uuidSchema,
  clientMutationId: clientMutationIdSchema,
  userMedicationId: uuidSchema,
  scheduleId: uuidSchema.nullable(),
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  reminderAt: z.iso.datetime({ offset: true }).nullable(),
  quantityValue: quantityValueSchema.nullable(),
  quantityUnit: quantityUnitSchema.nullable(),
  source: z.enum(DOSE_EVENT_SOURCES),
});

export type CreateDoseEventInput = z.infer<typeof createDoseEventSchema>;

/**
 * A status transition (Taken/Skip/Snooze/etc — Phase 3 §2.2's dose action
 * sheet). No `baseVersion` — this entity is idempotent-by-id, never
 * optimistic concurrency (`designing-offline-sync`).
 */
export const transitionDoseEventSchema = z
  .object({
    id: uuidSchema,
    clientMutationId: clientMutationIdSchema,
    status: doseEventStatusSchema.exclude(["scheduled"]),
    takenAt: z.iso.datetime({ offset: true }).optional(),
    quantityValue: quantityValueSchema.optional(),
    quantityUnit: quantityUnitSchema.optional(),
    reminderAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((data) => (data.status !== "taken" && data.status !== "taken_late") || data.takenAt !== undefined, {
    message: "Απαιτείται ώρα λήψης.",
    path: ["takenAt"],
  });

export type TransitionDoseEventInput = z.infer<typeof transitionDoseEventSchema>;
