import { newId } from "@/lib/domain/ids";
import { deriveWallClockScheduleKind } from "@/lib/domain/schedule-draft";
import {
  cancelFutureDoseEventsForMedication,
  generateDoseEventsForSchedule,
  reconcileDoseEventsForSchedule,
} from "@/lib/scheduling/client/dose-event-generator";
import { isScheduleCurrent } from "@/lib/medications/schedule-summary";
import type { DoseEventRepository, MedicationScheduleRepository, UserMedicationRepository } from "@/lib/domain/repositories";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { UserMedicationPatch, UserMedicationRecord } from "@/lib/domain/user-medication";

/** A change to one wall-clock schedule's times of day and/or start date, from the Edit Medication screen. */
export interface ScheduleEdit {
  scheduleId: string;
  /** "HH:MM:SS", any order — normalized here. */
  timesOfDay: string[];
  /** "YYYY-MM-DD". */
  startDate: string;
}

export interface SaveMedicationEditsDeps {
  medications: Pick<UserMedicationRepository, "update">;
  schedules: Pick<MedicationScheduleRepository, "get" | "softDelete" | "create" | "listByUserMedication">;
  doseEvents: DoseEventRepository;
  now?: () => Date;
}

function normalizeTimes(times: string[]): string[] {
  return [...new Set(times)].sort();
}

function sameTimes(a: string[] | null, b: string[]): boolean {
  if (!a) return false;
  const left = normalizeTimes(a);
  return left.length === b.length && left.every((t, i) => t === b[i]);
}

function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Applies an Edit Medication save as one local, offline-first sequence —
 * every step is a Dexie write with its own outbox entry, so it all syncs
 * later:
 *
 * 1. The medication's own fields.
 * 2. A schedule edit, if any (new times and/or start date).
 * 3. Treatment state: leaving "active" cancels every future unrecorded
 *    dose (no more reminders for a medication the user stopped); coming
 *    back to "active" brings upcoming doses back. Done last, so a schedule
 *    edit on a stopped medication can't leave fresh doses behind.
 *
 * Why steps 2 and 3 REPLACE the schedule (soft-delete + create) instead of
 * updating it in place: a generated dose's id is derived from (schedule,
 * instant) so every device generates the same ids — which also means a
 * dose cancelled at an instant blocks that instant from ever being
 * generated again for the same schedule. Resuming a medication within the
 * generation window, or moving a time back to one just removed, would
 * silently produce no doses. A new schedule gets fresh ids, and stays
 * deterministic across devices. (A wall-clock schedule's kind is also
 * immutable — 1 ↔ several times a day already had to be delete + create.)
 * Past doses are never touched: adherence history is what it was.
 *
 * The caller refreshes native reminders afterwards.
 */
export async function saveMedicationEdits(
  medication: UserMedicationRecord,
  patch: UserMedicationPatch & Pick<UserMedicationRecord, "treatmentState">,
  scheduleEdit: ScheduleEdit | null,
  deps: SaveMedicationEditsDeps,
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  await deps.medications.update(medication.id, patch, newId());

  const edited = new Set<string>();
  if (scheduleEdit) {
    const schedule = await deps.schedules.get(scheduleEdit.scheduleId);
    if (schedule && schedule.deletedAt === null && schedule.userMedicationId === medication.id && schedule.timeAnchor === "wall_clock") {
      const times = normalizeTimes(scheduleEdit.timesOfDay);
      if (times.length > 0 && (!sameTimes(schedule.timesOfDay, times) || scheduleEdit.startDate !== schedule.startDate)) {
        await replaceSchedule(schedule, { timesOfDay: times, startDate: scheduleEdit.startDate }, deps, now);
        edited.add(schedule.id);
      }
    }
  }

  const wasActive = medication.treatmentState === "active";
  const isActive = patch.treatmentState === "active";
  if (!isActive) {
    // Also covers a schedule replaced just above while the medication is stopped.
    await cancelFutureDoseEventsForMedication(medication.id, deps.schedules, deps.doseEvents, now);
  } else if (!wasActive) {
    // Resuming: replace each still-running schedule so its upcoming
    // instants aren't blocked by the doses cancelled when it was stopped.
    const today = localDate(now);
    for (const schedule of await deps.schedules.listByUserMedication(medication.id)) {
      if (edited.has(schedule.id) || !isScheduleCurrent(schedule, today)) continue;
      await replaceSchedule(schedule, {}, deps, now);
    }
  }
}

/** Soft-deletes `schedule` (cancelling its future doses) and creates its successor with `changes` applied, generating the successor's upcoming doses. */
async function replaceSchedule(
  schedule: MedicationScheduleRecord,
  changes: { timesOfDay?: string[]; startDate?: string },
  deps: SaveMedicationEditsDeps,
  now: Date,
): Promise<MedicationScheduleRecord> {
  await deps.schedules.softDelete(schedule.id, newId());
  const deleted = await deps.schedules.get(schedule.id);
  if (deleted) await reconcileDoseEventsForSchedule(deleted, deps.doseEvents, now);

  const timesOfDay = changes.timesOfDay ?? schedule.timesOfDay;
  const scheduleKind =
    schedule.timeAnchor === "wall_clock" && timesOfDay ? deriveWallClockScheduleKind(timesOfDay, schedule.weekdaysMask) : schedule.scheduleKind;
  const created = await deps.schedules.create({
    id: newId(),
    clientMutationId: newId(),
    profileId: schedule.profileId,
    userMedicationId: schedule.userMedicationId,
    scheduleKind,
    startDate: changes.startDate ?? schedule.startDate,
    endDate: schedule.endDate,
    timezone: schedule.timezone,
    doseQuantityValue: schedule.doseQuantityValue,
    doseQuantityUnit: schedule.doseQuantityUnit,
    timesOfDay,
    weekdaysMask: schedule.weekdaysMask,
    intervalHours: schedule.intervalHours,
    anchorAt: schedule.anchorAt,
  });
  await generateDoseEventsForSchedule(created, deps.doseEvents, now);
  return created;
}
