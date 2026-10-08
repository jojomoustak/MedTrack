import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { generateDoseEventsForSchedule } from "@/lib/scheduling/client/dose-event-generator";
import { saveMedicationEdits, type SaveMedicationEditsDeps } from "@/lib/medications/client/save-medication-edits";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";

const PROFILE = "profile-1";
// Sep 1 2026, 00:00 UTC (03:00 Athens) — every test's "now".
const NOW = new Date("2026-09-01T00:00:00Z");

describe("saveMedicationEdits", () => {
  let db: MedTrackingDexie;
  let medications: DexieUserMedicationRepository;
  let schedules: DexieMedicationScheduleRepository;
  let doseEvents: DexieDoseEventRepository;
  let deps: SaveMedicationEditsDeps;
  let medication: UserMedicationRecord;

  beforeEach(async () => {
    db = new MedTrackingDexie(`test-save-edits-${crypto.randomUUID()}`);
    const outbox = new DexieOutboxRepository(db);
    medications = new DexieUserMedicationRepository(db, outbox);
    schedules = new DexieMedicationScheduleRepository(db, outbox);
    doseEvents = new DexieDoseEventRepository(db, outbox);
    deps = { medications, schedules, doseEvents, now: () => NOW };
    medication = await medications.create({
      id: crypto.randomUUID(),
      profileId: PROFILE,
      clientMutationId: crypto.randomUUID(),
      catalogProductId: null,
      customName: "Metformin",
      customForm: "tablet",
      customStrengthValue: "500",
      customStrengthUnit: "mg",
      inventoryUnit: "tablet",
      lowStockThresholdValue: null,
      expiryWarningDays: 30,
      notes: null,
    });
  });

  afterEach(async () => {
    await db.delete();
  });

  async function scheduleWith(timesOfDay: string[]): Promise<MedicationScheduleRecord> {
    const schedule = await schedules.create({
      id: crypto.randomUUID(),
      clientMutationId: crypto.randomUUID(),
      profileId: PROFILE,
      userMedicationId: medication.id,
      scheduleKind: timesOfDay.length > 1 ? "multiple_times_daily" : "daily",
      startDate: "2026-08-01",
      endDate: null,
      timezone: "Europe/Athens",
      doseQuantityValue: "1",
      doseQuantityUnit: "tablet",
      timesOfDay,
      weekdaysMask: null,
      intervalHours: null,
      anchorAt: null,
    });
    await generateDoseEventsForSchedule(schedule, doseEvents, NOW);
    return schedule;
  }

  async function upcomingTimes(): Promise<string[]> {
    const events = await doseEvents.listByUserMedication(medication.id);
    return events
      .filter((e) => e.status !== "cancelled")
      .map((e) => e.scheduledAt!)
      .sort();
  }

  it("stopping a medication cancels its future doses, and resuming brings them back", async () => {
    // Safety (2026-10-05): pausing or discontinuing used to leave every
    // future dose — and its native reminder — in place.
    await scheduleWith(["08:00:00"]);
    expect(await upcomingTimes()).toHaveLength(3);

    await saveMedicationEdits(medication, { treatmentState: "paused" }, null, deps);
    expect(await upcomingTimes()).toHaveLength(0);

    const paused = (await medications.get(medication.id))!;
    await saveMedicationEdits(paused, { treatmentState: "active" }, null, deps);
    expect(await upcomingTimes()).toHaveLength(3);
  });

  it("moves future doses to the new times", async () => {
    const schedule = await scheduleWith(["08:00:00", "20:00:00"]);

    await saveMedicationEdits(medication, { treatmentState: "active" }, { scheduleId: schedule.id, timesOfDay: ["21:00:00", "09:00:00"], startDate: "2026-08-01" }, deps);

    const current = (await schedules.listByUserMedication(medication.id)).filter((s) => s.deletedAt === null);
    expect(current).toHaveLength(1);
    expect(current[0].timesOfDay).toEqual(["09:00:00", "21:00:00"]);
    // 09:00 / 21:00 Athens = 06:00 / 18:00 UTC
    const upcoming = await upcomingTimes();
    expect(upcoming).toHaveLength(6);
    expect(upcoming.every((t) => t.endsWith("T06:00:00.000Z") || t.endsWith("T18:00:00.000Z"))).toBe(true);
  });

  it("still produces doses when a time is changed and then changed back", async () => {
    // A cancelled dose's id is derived from (schedule, instant), so editing
    // a schedule in place could never regenerate an instant it once
    // cancelled — 08:00 → 09:00 → 08:00 would leave no 08:00 doses.
    const schedule = await scheduleWith(["08:00:00"]);
    await saveMedicationEdits(medication, { treatmentState: "active" }, { scheduleId: schedule.id, timesOfDay: ["09:00:00"], startDate: "2026-08-01" }, deps);
    const second = (await schedules.listByUserMedication(medication.id)).find((s) => s.deletedAt === null)!;
    await saveMedicationEdits(medication, { treatmentState: "active" }, { scheduleId: second.id, timesOfDay: ["08:00:00"], startDate: "2026-08-01" }, deps);

    const upcoming = await upcomingTimes();
    expect(upcoming).toHaveLength(3);
    expect(upcoming.every((t) => t.endsWith("T05:00:00.000Z"))).toBe(true); // 08:00 Athens
  });

  it("replaces the schedule when going from once to twice a day, since a schedule's kind can't change", async () => {
    const schedule = await scheduleWith(["08:00:00"]);

    await saveMedicationEdits(medication, { treatmentState: "active" }, { scheduleId: schedule.id, timesOfDay: ["08:00:00", "20:00:00"], startDate: "2026-08-01" }, deps);

    expect((await schedules.get(schedule.id))!.deletedAt).not.toBeNull();
    const current = (await schedules.listByUserMedication(medication.id)).filter((s) => s.deletedAt === null);
    expect(current).toHaveLength(1);
    expect(current[0].scheduleKind).toBe("multiple_times_daily");
    expect(current[0].timesOfDay).toEqual(["08:00:00", "20:00:00"]);
    // the old schedule's doses are cancelled; the new one has its own
    const events = await doseEvents.listByUserMedication(medication.id);
    expect(events.filter((e) => e.scheduleId === schedule.id).every((e) => e.status === "cancelled")).toBe(true);
    expect(events.filter((e) => e.scheduleId === current[0].id && e.status === "scheduled")).toHaveLength(6);
  });

  it("leaves no future doses when the schedule of a medication being stopped is edited in the same save", async () => {
    const schedule = await scheduleWith(["08:00:00"]);
    await saveMedicationEdits(medication, { treatmentState: "discontinued" }, { scheduleId: schedule.id, timesOfDay: ["10:00:00"], startDate: "2026-08-01" }, deps);
    expect(await upcomingTimes()).toHaveLength(0);
  });

  it("changes nothing about the schedule when the times and start date are unchanged", async () => {
    const schedule = await scheduleWith(["08:00:00"]);
    await saveMedicationEdits(medication, { treatmentState: "active", notes: "Με φαγητό" }, { scheduleId: schedule.id, timesOfDay: ["08:00:00"], startDate: "2026-08-01" }, deps);
    expect((await schedules.get(schedule.id))!.version).toBe(1);
    expect((await medications.get(medication.id))!.notes).toBe("Με φαγητό");
  });
});
