/**
 * Read-only, ephemeral projection of future doses for Calendar's month and
 * timeline views (ADR-014). Deliberately NOT a `DoseEventRecord` — no
 * `id`/`status`/persisted fields — so nothing can call
 * `DoseEventRepository.transition()` on one; that type gap is the actual
 * guardrail against ever treating a projection as a loggable dose, not
 * just a UI styling choice. Recomputed fresh on every render directly from
 * already-synced `MedicationSchedule` rows — no I/O, no caching, no
 * materialized `DoseEvent`, so a schedule edit is reflected instantly with
 * nothing to reconcile.
 *
 * Only ever meaningful beyond `now + GENERATION_HORIZON_MS`
 * (`lib/scheduling/client/dose-event-generator.ts`) — everything inside
 * that horizon already has real, materialized `DoseEventRecord`s and
 * should be read from there instead, never from this module.
 */
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import { computeScheduleInstants, RECURRING_SCHEDULE_KINDS } from "@/lib/domain/dose-event-generation";

export interface ProjectedDoseInstant {
  scheduleId: string;
  userMedicationId: string;
  /** ISO instant, UTC. */
  scheduledAt: string;
}

/**
 * Every instant `schedules` would produce within `[from, to]` (inclusive),
 * across all of them, sorted ascending by `scheduledAt`. Soft-deleted and
 * non-recurring (`prn`) schedules are skipped, mirroring
 * `dose-event-generator.ts`'s own guard — callers are still responsible
 * for passing only schedules belonging to a treatable (not paused/
 * discontinued) `UserMedication`, since that state lives on a different
 * record this function never sees.
 */
export function projectDoseInstantsForRange(schedules: readonly MedicationScheduleRecord[], from: Date, to: Date): ProjectedDoseInstant[] {
  const window = { windowStart: from, windowEnd: to };
  const projected: ProjectedDoseInstant[] = [];

  for (const schedule of schedules) {
    if (schedule.deletedAt !== null || !RECURRING_SCHEDULE_KINDS.includes(schedule.scheduleKind)) continue;

    for (const instant of computeScheduleInstants(schedule, window)) {
      projected.push({
        scheduleId: schedule.id,
        userMedicationId: schedule.userMedicationId,
        scheduledAt: instant.toISOString(),
      });
    }
  }

  return projected.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}
