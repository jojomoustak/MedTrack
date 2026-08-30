/**
 * Orchestrates materializing `DoseEvent` rows from a schedule's
 * recurrence (Phase 10) — the repository-I/O layer above
 * `lib/domain/dose-event-generation.ts`'s pure expansion math.
 *
 * Regeneration triggers this module's functions are meant to be called
 * from (data-architect design, 2026-08-30 — concrete list; the UI layer
 * that builds/edits schedules is responsible for calling the first
 * three, since a repository's `create`/`update` should stay pure CRUD
 * rather than reach sideways into generation):
 *   1. Right after `MedicationScheduleRepository.create()` — generate
 *      the window for that one schedule immediately, same tick.
 *   2. Right after an `update()` that touches recurrence fields — call
 *      `reconcileDoseEventsForSchedule`, not `generateDoseEventsForSchedule`,
 *      so instances the new recurrence no longer produces get cancelled.
 *   3. Schedule soft-delete, or the owning `UserMedication.treatmentState`
 *      leaving `"active"` — cancel every future non-terminal `DoseEvent`
 *      tied to it (not yet wired anywhere; no medication-edit/pause UI
 *      exists yet to trigger it from — flagged here, not solved).
 *   4. `applyRemote` on a pulled `MedicationSchedule` (own mutation ack,
 *      or another device's edit) — `lib/sync/client/apply-result.ts`
 *      calls `reconcileDoseEventsForSchedule` here.
 *   5. App-foreground/cold-start, periodically while foregrounded —
 *      `topUpDoseEventWindow`, wired into `lib/sync/client/sync-manager.ts`.
 *   6. Same cadence as #5 — `sweepMissedDoseEvents`, also wired there.
 */
import { computeScheduleInstants, deriveScheduledDoseEventId, RECURRING_SCHEDULE_KINDS } from "@/lib/domain/dose-event-generation";
import { isTerminalDoseEventStatus } from "@/lib/domain/dose-event";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { DoseEventRepository, MedicationScheduleRepository } from "@/lib/domain/repositories";
import { newId } from "@/lib/domain/ids";

/** How far ahead a schedule's DoseEvents are kept materialized — wider than a naive 24-48h so Phase 11's native alarms always have a real row to act on even if the app isn't opened for a day. */
export const GENERATION_HORIZON_MS = 72 * 3_600_000;
/** Grace window before a fired-but-unacted dose is swept to `missed`. A product constant pending real UX validation (data-architect flagged this as a decision for `product-architect`/UX to actually pin down — not derived from any spec today). */
export const DEFAULT_MISSED_GRACE_MINUTES = 60;

export interface GenerateForScheduleResult {
  created: number;
}

/**
 * Generates (idempotently) every instance a schedule produces within
 * `[now, now + horizonMs]`. Safe to call repeatedly for the same
 * schedule/window — `deriveScheduledDoseEventId` makes every call
 * compute the same ids for the same instants, and `createIfMissing` is a
 * true no-op for an id that already exists.
 */
export async function generateDoseEventsForSchedule(
  schedule: MedicationScheduleRecord,
  doseEvents: DoseEventRepository,
  now: Date = new Date(),
  horizonMs: number = GENERATION_HORIZON_MS,
): Promise<GenerateForScheduleResult> {
  // A soft-deleted schedule must never generate new instances -- only
  // reconcileDoseEventsForSchedule's cancellation loop (which doesn't
  // depend on this function's early-return) still runs for one, to
  // cancel whatever future instances it already had.
  if (schedule.deletedAt !== null || !RECURRING_SCHEDULE_KINDS.includes(schedule.scheduleKind)) {
    return { created: 0 };
  }

  const windowEnd = new Date(now.getTime() + horizonMs);
  const instants = computeScheduleInstants(schedule, { windowStart: now, windowEnd });

  let created = 0;
  for (const instant of instants) {
    const scheduledAtIso = instant.toISOString();
    const id = await deriveScheduledDoseEventId(schedule.id, scheduledAtIso);
    const existing = await doseEvents.get(id);
    if (existing) continue;
    await doseEvents.createIfMissing({
      id,
      profileId: schedule.profileId,
      userMedicationId: schedule.userMedicationId,
      scheduleId: schedule.id,
      scheduledAt: scheduledAtIso,
      reminderAt: scheduledAtIso,
      quantityValue: schedule.doseQuantityValue,
      quantityUnit: schedule.doseQuantityUnit,
      source: "schedule_generated",
      clientMutationId: newId(),
    });
    created++;
  }
  return { created };
}

/**
 * Reconciles a schedule's materialized FUTURE instances against its
 * (possibly just-edited) recurrence: cancels any non-terminal future
 * instance whose instant no longer appears in the recomputed set, then
 * tops up forward. Never touches a PAST or already-terminal row —
 * adherence history is immutable once recorded, and a past non-terminal
 * row is `sweepMissedDoseEvents`'s job, not this function's.
 */
export async function reconcileDoseEventsForSchedule(
  schedule: MedicationScheduleRecord,
  doseEvents: DoseEventRepository,
  now: Date = new Date(),
  horizonMs: number = GENERATION_HORIZON_MS,
): Promise<void> {
  const nowIso = now.toISOString();
  const windowEnd = new Date(now.getTime() + horizonMs);
  // A deleted schedule produces no valid instants at all -- every future
  // non-terminal instance gets cancelled below, none regenerated.
  const validInstants = new Set(
    schedule.deletedAt === null && RECURRING_SCHEDULE_KINDS.includes(schedule.scheduleKind)
      ? computeScheduleInstants(schedule, { windowStart: now, windowEnd }).map((d) => d.toISOString())
      : [],
  );

  const existingForSchedule = await doseEvents.listByScheduleId(schedule.id);
  for (const event of existingForSchedule) {
    if (isTerminalDoseEventStatus(event.status)) continue;
    if (event.scheduledAt === null || event.scheduledAt < nowIso) continue;
    if (!validInstants.has(event.scheduledAt)) {
      await doseEvents.transition(event.id, { status: "cancelled" }, newId());
    }
  }

  await generateDoseEventsForSchedule(schedule, doseEvents, now, horizonMs);
}

/** App-foreground/cold-start tick: extends every one of this profile's active schedules' materialized horizon. */
export async function topUpDoseEventWindow(
  profileId: string,
  schedules: MedicationScheduleRepository,
  doseEvents: DoseEventRepository,
  now: Date = new Date(),
  horizonMs: number = GENERATION_HORIZON_MS,
): Promise<void> {
  const activeSchedules = await schedules.list(profileId);
  for (const schedule of activeSchedules) {
    await generateDoseEventsForSchedule(schedule, doseEvents, now, horizonMs);
  }
}

/** Missed-dose sweep: any non-terminal dose whose scheduled instant is more than `graceMinutes` in the past transitions to `missed`. Returns how many were swept. */
export async function sweepMissedDoseEvents(
  profileId: string,
  doseEvents: DoseEventRepository,
  now: Date = new Date(),
  graceMinutes: number = DEFAULT_MISSED_GRACE_MINUTES,
): Promise<number> {
  const cutoff = new Date(now.getTime() - graceMinutes * 60_000).toISOString();
  const overdue = await doseEvents.listNonTerminalBefore(profileId, cutoff);
  for (const event of overdue) {
    await doseEvents.transition(event.id, { status: "missed" }, newId());
  }
  return overdue.length;
}
