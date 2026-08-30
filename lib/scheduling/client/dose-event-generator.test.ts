import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import {
  generateDoseEventsForSchedule,
  reconcileDoseEventsForSchedule,
  sweepMissedDoseEvents,
  topUpDoseEventWindow,
} from "@/lib/scheduling/client/dose-event-generator";
import type { CreateMedicationScheduleInput } from "@/lib/domain/medication-schedule";

const PROFILE_ID = "profile-1";

function dailyInput(overrides: Partial<CreateMedicationScheduleInput> = {}): CreateMedicationScheduleInput {
  return {
    id: crypto.randomUUID(),
    profileId: PROFILE_ID,
    userMedicationId: "med-1",
    clientMutationId: crypto.randomUUID(),
    scheduleKind: "daily",
    startDate: "2026-01-01",
    endDate: null,
    timezone: "Europe/Athens",
    doseQuantityValue: "1",
    doseQuantityUnit: "tablet",
    timesOfDay: ["08:00:00"],
    weekdaysMask: null,
    intervalHours: null,
    anchorAt: null,
    ...overrides,
  };
}

describe("dose-event-generator", () => {
  let db: MedTrackingDexie;
  let scheduleRepo: DexieMedicationScheduleRepository;
  let doseEventRepo: DexieDoseEventRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-generator-${crypto.randomUUID()}`);
    const outbox = new DexieOutboxRepository(db);
    scheduleRepo = new DexieMedicationScheduleRepository(db, outbox);
    doseEventRepo = new DexieDoseEventRepository(db, outbox);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("generateDoseEventsForSchedule materializes one DoseEvent per instant in the window", async () => {
    const schedule = await scheduleRepo.create(dailyInput());
    const now = new Date("2026-09-01T00:00:00Z");

    const result = await generateDoseEventsForSchedule(schedule, doseEventRepo, now, 3 * 24 * 3_600_000);

    expect(result.created).toBe(3); // Sep 1, 2, 3 at 08:00 Europe/Athens
    const events = await doseEventRepo.listByScheduleId(schedule.id);
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.status === "scheduled" && e.source === "schedule_generated")).toBe(true);
  });

  it("generateDoseEventsForSchedule is idempotent — calling it again creates nothing new", async () => {
    const schedule = await scheduleRepo.create(dailyInput());
    const now = new Date("2026-09-01T00:00:00Z");

    await generateDoseEventsForSchedule(schedule, doseEventRepo, now);
    const second = await generateDoseEventsForSchedule(schedule, doseEventRepo, now);

    expect(second.created).toBe(0);
  });

  it("generateDoseEventsForSchedule generates nothing for a PRN schedule", async () => {
    const schedule = await scheduleRepo.create(dailyInput({ scheduleKind: "prn", timesOfDay: null }));
    const result = await generateDoseEventsForSchedule(schedule, doseEventRepo, new Date("2026-09-01T00:00:00Z"));
    expect(result.created).toBe(0);
  });

  it("reconcileDoseEventsForSchedule cancels a future non-terminal instance no longer produced by an edited recurrence", async () => {
    const schedule = await scheduleRepo.create(dailyInput({ timesOfDay: ["08:00:00", "20:00:00"] }));
    const now = new Date("2026-09-01T00:00:00Z");
    await generateDoseEventsForSchedule(schedule, doseEventRepo, now, 24 * 3_600_000);

    const before = await doseEventRepo.listByScheduleId(schedule.id);
    expect(before).toHaveLength(2);

    // Edit: drop the 20:00 dose.
    const edited = await scheduleRepo.update(schedule.id, { timesOfDay: ["08:00:00"] }, crypto.randomUUID());
    await reconcileDoseEventsForSchedule(edited, doseEventRepo, now, 24 * 3_600_000);

    const after = await doseEventRepo.listByScheduleId(schedule.id);
    const cancelled = after.filter((e) => e.status === "cancelled");
    const active = after.filter((e) => e.status !== "cancelled");
    expect(cancelled).toHaveLength(1);
    expect(active).toHaveLength(1);
    expect(active[0].scheduledAt).toBe("2026-09-01T05:00:00.000Z"); // 08:00 Europe/Athens
  });

  it("reconcileDoseEventsForSchedule never touches an already-terminal instance", async () => {
    const schedule = await scheduleRepo.create(dailyInput({ timesOfDay: ["08:00:00", "20:00:00"] }));
    const now = new Date("2026-09-01T00:00:00Z");
    await generateDoseEventsForSchedule(schedule, doseEventRepo, now, 24 * 3_600_000);

    const [first] = await doseEventRepo.listByScheduleId(schedule.id);
    await doseEventRepo.transition(first.id, { status: "taken", takenAt: now.toISOString() }, crypto.randomUUID());

    const edited = await scheduleRepo.update(schedule.id, { timesOfDay: ["09:00:00"] }, crypto.randomUUID());
    await reconcileDoseEventsForSchedule(edited, doseEventRepo, now, 24 * 3_600_000);

    const stillTaken = await doseEventRepo.get(first.id);
    expect(stillTaken?.status).toBe("taken");
  });

  it("generateDoseEventsForSchedule generates nothing for a soft-deleted schedule", async () => {
    const schedule = await scheduleRepo.create(dailyInput());
    await scheduleRepo.softDelete(schedule.id, crypto.randomUUID());
    const deleted = await scheduleRepo.get(schedule.id);

    const result = await generateDoseEventsForSchedule(deleted!, doseEventRepo, new Date("2026-09-01T00:00:00Z"));
    expect(result.created).toBe(0);
  });

  it("reconcileDoseEventsForSchedule cancels every future non-terminal instance and generates nothing for a soft-deleted schedule", async () => {
    const schedule = await scheduleRepo.create(dailyInput());
    const now = new Date("2026-09-01T00:00:00Z");
    await generateDoseEventsForSchedule(schedule, doseEventRepo, now, 3 * 24 * 3_600_000);
    expect(await doseEventRepo.listByScheduleId(schedule.id)).toHaveLength(3);

    await scheduleRepo.softDelete(schedule.id, crypto.randomUUID());
    const deleted = await scheduleRepo.get(schedule.id);
    await reconcileDoseEventsForSchedule(deleted!, doseEventRepo, now, 3 * 24 * 3_600_000);

    const after = await doseEventRepo.listByScheduleId(schedule.id);
    expect(after.every((e) => e.status === "cancelled")).toBe(true);
  });

  it("topUpDoseEventWindow generates ahead for every active schedule belonging to the profile", async () => {
    await scheduleRepo.create(dailyInput({ userMedicationId: "med-a" }));
    await scheduleRepo.create(dailyInput({ userMedicationId: "med-b" }));

    const now = new Date("2026-09-01T00:00:00Z");
    await topUpDoseEventWindow(PROFILE_ID, scheduleRepo, doseEventRepo, now, 2 * 24 * 3_600_000);

    const medA = await doseEventRepo.listByUserMedication("med-a");
    const medB = await doseEventRepo.listByUserMedication("med-b");
    expect(medA.length).toBeGreaterThan(0);
    expect(medB.length).toBeGreaterThan(0);
  });

  it("sweepMissedDoseEvents transitions an overdue non-terminal dose to 'missed'", async () => {
    const schedule = await scheduleRepo.create(dailyInput());
    const now = new Date("2026-09-01T09:00:00Z"); // well after the 05:00 UTC (08:00 local) dose
    await generateDoseEventsForSchedule(schedule, doseEventRepo, new Date("2026-09-01T00:00:00Z"), 24 * 3_600_000);

    const swept = await sweepMissedDoseEvents(PROFILE_ID, doseEventRepo, now, 60);
    expect(swept).toBe(1);

    const events = await doseEventRepo.listByScheduleId(schedule.id);
    expect(events[0].status).toBe("missed");
  });

  it("sweepMissedDoseEvents leaves a dose within its grace window alone", async () => {
    const schedule = await scheduleRepo.create(dailyInput());
    // Dose at 05:00 UTC; "now" is only 10 minutes later, well within a 60-minute grace window.
    const now = new Date("2026-09-01T05:10:00Z");
    await generateDoseEventsForSchedule(schedule, doseEventRepo, new Date("2026-09-01T00:00:00Z"), 24 * 3_600_000);

    const swept = await sweepMissedDoseEvents(PROFILE_ID, doseEventRepo, now, 60);
    expect(swept).toBe(0);
  });
});
