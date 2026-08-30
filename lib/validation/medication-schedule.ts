import { z } from "zod";
import { clientMutationIdSchema, quantityUnitSchema, quantityValueSchema, uuidSchema, versionSchema } from "@/lib/validation/common";
import { SCHEDULE_KINDS } from "@/lib/domain/medication-schedule";

const scheduleKindSchema = z.enum(SCHEDULE_KINDS);
const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Ώρα σε μορφή HH:MM.");
/** `chk_interval_hours_range` (Phase 2 §2.6). */
const intervalHoursSchema = z.int().min(1).max(168);
/** Bits 0-6 only (`WEEKDAY_BIT`, `lib/domain/medication-schedule.ts`) — 0b1111111 = 127. */
const weekdaysMaskSchema = z.int().min(1).max(127);

/**
 * Shared by the client schedule builder (Phase 3 §2.5) and the server
 * mutation handler. `timeAnchor` is never part of this schema —
 * `deriveTimeAnchor(scheduleKind)` is the only source of truth for it
 * (data-architect design, 2026-08-30), so a client can't send a
 * mismatched pairing even by accident; `chk_anchor_matches_kind` is the
 * DB-level backstop, not the primary defense.
 */
export const createMedicationScheduleSchema = z
  .object({
    id: uuidSchema,
    clientMutationId: clientMutationIdSchema,
    userMedicationId: uuidSchema,
    scheduleKind: scheduleKindSchema,
    startDate: z.iso.date(),
    endDate: z.iso.date().nullable(),
    timezone: z.string().min(1).max(64),
    doseQuantityValue: quantityValueSchema,
    doseQuantityUnit: quantityUnitSchema,
    timesOfDay: z.array(timeOfDaySchema).min(1).max(12).nullable(),
    weekdaysMask: weekdaysMaskSchema.nullable(),
    intervalHours: intervalHoursSchema.nullable(),
    anchorAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "Η ημερομηνία λήξης πρέπει να είναι μετά την ημερομηνία έναρξης.",
    path: ["endDate"],
  })
  .refine(
    (data) => {
      if (data.scheduleKind === "prn") return true;
      if (data.scheduleKind === "every_n_hours") return data.intervalHours !== null && data.anchorAt !== null;
      return data.timesOfDay !== null && data.timesOfDay.length > 0;
    },
    { message: "Λείπουν τα στοιχεία που απαιτούνται για αυτόν τον τύπο προγράμματος.", path: ["timesOfDay"] },
  )
  .refine((data) => data.scheduleKind !== "specific_weekdays" || data.weekdaysMask !== null, {
    message: "Επιλέξτε τουλάχιστον μία ημέρα.",
    path: ["weekdaysMask"],
  });

export type CreateMedicationScheduleInput = z.infer<typeof createMedicationScheduleSchema>;

/** `scheduleKind` is deliberately absent — immutable after creation (data-architect design: changing kind is delete+create, never an in-place edit). */
export const updateMedicationScheduleSchema = z.object({
  id: uuidSchema,
  clientMutationId: clientMutationIdSchema,
  baseVersion: versionSchema,
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
  doseQuantityValue: quantityValueSchema.optional(),
  doseQuantityUnit: quantityUnitSchema.optional(),
  timesOfDay: z.array(timeOfDaySchema).min(1).max(12).nullable().optional(),
  weekdaysMask: weekdaysMaskSchema.nullable().optional(),
  intervalHours: intervalHoursSchema.nullable().optional(),
  anchorAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

export type UpdateMedicationScheduleInput = z.infer<typeof updateMedicationScheduleSchema>;
