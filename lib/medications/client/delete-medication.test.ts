import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteMedicationWithCascade } from "@/lib/medications/client/delete-medication";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { generateDoseEventsForSchedule } from "@/lib/scheduling/client/dose-event-generator";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";

const PROFILE_ID = crypto.randomUUID();
const MED_ID = crypto.randomUUID();

let db: MedTrackingDexie;

beforeEach(() => {
  db = new MedTrackingDexie(`test-delete-medication-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
});

afterEach(async () => {
  __setClientDbForTests(undefined);
  await db.delete();
});

describe("deleteMedicationWithCascade", () => {
  it("soft-deletes the medication, soft-deletes its active schedule, and cancels the schedule's future non-terminal dose events", async () => {
    const medRepo = new DexieUserMedicationRepository(db);
    const scheduleRepo = new DexieMedicationScheduleRepository(db);
    const doseEventRepo = new DexieDoseEventRepository(db);

    await medRepo.create({
      id: MED_ID,
      profileId: PROFILE_ID,
      clientMutationId: crypto.randomUUID(),
      catalogProductId: null,
      customName: "Παρακεταμόλη",
      customForm: "tablet",
      customStrengthValue: null,
      customStrengthUnit: null,
      inventoryUnit: "tablet",
      lowStockThresholdValue: null,
      expiryWarningDays: 30,
      notes: null,
    });

    const schedule = await scheduleRepo.create({
      id: crypto.randomUUID(),
      profileId: PROFILE_ID,
      userMedicationId: MED_ID,
      clientMutationId: crypto.randomUUID(),
      scheduleKind: "daily",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: null,
      timezone: "Europe/Athens",
      doseQuantityValue: "1",
      doseQuantityUnit: "tablet",
      timesOfDay: ["08:00:00"],
      weekdaysMask: null,
      intervalHours: null,
      anchorAt: null,
    });
    await generateDoseEventsForSchedule(schedule, doseEventRepo);

    const doseEventsBefore = await doseEventRepo.listByScheduleId(schedule.id);
    expect(doseEventsBefore.length).toBeGreaterThan(0);
    expect(doseEventsBefore.every((d) => d.status === "scheduled")).toBe(true);

    await deleteMedicationWithCascade(PROFILE_ID, MED_ID);

    const medication = await medRepo.get(MED_ID);
    expect(medication?.deletedAt).not.toBeNull();

    const scheduleAfter = await scheduleRepo.get(schedule.id);
    expect(scheduleAfter?.deletedAt).not.toBeNull();

    const doseEventsAfter = await doseEventRepo.listByScheduleId(schedule.id);
    expect(doseEventsAfter.length).toBeGreaterThan(0);
    expect(doseEventsAfter.every((d) => d.status === "cancelled")).toBe(true);
  });

  it("is a no-op on schedules that are already soft-deleted", async () => {
    const medRepo = new DexieUserMedicationRepository(db);
    const scheduleRepo = new DexieMedicationScheduleRepository(db);

    await medRepo.create({
      id: MED_ID,
      profileId: PROFILE_ID,
      clientMutationId: crypto.randomUUID(),
      catalogProductId: null,
      customName: "Παρακεταμόλη",
      customForm: "tablet",
      customStrengthValue: null,
      customStrengthUnit: null,
      inventoryUnit: "tablet",
      lowStockThresholdValue: null,
      expiryWarningDays: 30,
      notes: null,
    });

    const schedule = await scheduleRepo.create({
      id: crypto.randomUUID(),
      profileId: PROFILE_ID,
      userMedicationId: MED_ID,
      clientMutationId: crypto.randomUUID(),
      scheduleKind: "daily",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: null,
      timezone: "Europe/Athens",
      doseQuantityValue: "1",
      doseQuantityUnit: "tablet",
      timesOfDay: ["08:00:00"],
      weekdaysMask: null,
      intervalHours: null,
      anchorAt: null,
    });
    await scheduleRepo.softDelete(schedule.id, crypto.randomUUID());
    const versionAfterFirstDelete = (await scheduleRepo.get(schedule.id))?.version;

    await deleteMedicationWithCascade(PROFILE_ID, MED_ID);

    // The cascade's own `deletedAt !== null` guard skips an already-
    // deleted schedule entirely, rather than calling softDelete() on it
    // again and bumping its version a second time for no reason.
    expect((await scheduleRepo.get(schedule.id))?.version).toBe(versionAfterFirstDelete);
  });
});
