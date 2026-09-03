import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { hydrateLocalDataFromServer } from "@/lib/sync/client/hydrate-local-data";
import type { SyncChangesResponseBody } from "@/lib/sync/protocol";

describe("hydrateLocalDataFromServer", () => {
  let db: MedTrackingDexie;
  let userMedication: DexieUserMedicationRepository;
  let medicationSchedule: DexieMedicationScheduleRepository;
  let doseEvent: DexieDoseEventRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-hydrate-${crypto.randomUUID()}`);
    userMedication = new DexieUserMedicationRepository(db);
    medicationSchedule = new DexieMedicationScheduleRepository(db);
    doseEvent = new DexieDoseEventRepository(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("applies pulled userMedication, medicationSchedule, and doseEvent changes to local storage", async () => {
    // Real bug (2026-08-30, Phase 10, found via live-device testing): this
    // hydration pass only ever consumed `userMedication` changes -- a
    // pulled medicationSchedule/doseEvent (e.g. synced from another
    // device, or this device after a reinstall) was silently dropped, so
    // Today/Calendar (both built on this same hydration pass via
    // useMedicationsList) never showed it until some OTHER sync path
    // happened to touch that record.
    const response: SyncChangesResponseBody = {
      nextCursor: 3,
      changes: [
        {
          id: 1,
          entityType: "userMedication",
          entityId: "med-1",
          operation: "create",
          serverVersion: 1,
          occurredAt: "2026-01-01T00:00:00.000Z",
          record: {
            id: "med-1",
            profileId: "profile-1",
            catalogProductId: null,
            customName: "Test Med",
            customForm: "tablet",
            customStrengthValue: null,
            customStrengthUnit: null,
            treatmentState: "active",
            inventoryUnit: "tablet",
            lowStockThresholdValue: null,
            expiryWarningDays: 30,
            notes: null,
            photoBlobKey: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            version: 1,
            deletedAt: null,
            clientMutationId: crypto.randomUUID(),
          },
        },
        {
          id: 2,
          entityType: "medicationSchedule",
          entityId: "schedule-1",
          operation: "create",
          serverVersion: 1,
          occurredAt: "2026-01-01T00:00:00.000Z",
          record: {
            id: "schedule-1",
            profileId: "profile-1",
            userMedicationId: "med-1",
            scheduleKind: "daily",
            timeAnchor: "wall_clock",
            startDate: "2026-01-01",
            endDate: null,
            timezone: "Europe/Athens",
            doseQuantityValue: "1",
            doseQuantityUnit: "tablet",
            timesOfDay: ["08:00:00"],
            weekdaysMask: null,
            intervalHours: null,
            anchorAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            version: 1,
            deletedAt: null,
            clientMutationId: crypto.randomUUID(),
          },
        },
        {
          id: 3,
          entityType: "doseEvent",
          entityId: "dose-1",
          operation: "create",
          serverVersion: null,
          occurredAt: "2026-01-01T08:00:00.000Z",
          record: {
            id: "dose-1",
            profileId: "profile-1",
            userMedicationId: "med-1",
            scheduleId: "schedule-1",
            scheduledAt: "2026-01-01T08:00:00.000Z",
            reminderAt: "2026-01-01T08:00:00.000Z",
            takenAt: null,
            status: "scheduled",
            quantityValue: "1",
            quantityUnit: "tablet",
            source: "schedule_generated",
            snoozeCount: 0,
            createdAt: "2026-01-01T08:00:00.000Z",
            updatedAt: "2026-01-01T08:00:00.000Z",
            clientMutationId: crypto.randomUUID(),
          },
        },
      ],
    };

    let calls = 0;
    const pullChanges = async (): Promise<SyncChangesResponseBody> => {
      calls++;
      return calls === 1 ? response : { nextCursor: response.nextCursor, changes: [] };
    };

    await hydrateLocalDataFromServer({ userMedication, medicationSchedule, doseEvent, pullChanges });

    const med = await userMedication.get("med-1");
    expect(med?.customName).toBe("Test Med");
    expect(med?.syncState).toBe("synced");

    const schedule = await medicationSchedule.get("schedule-1");
    expect(schedule?.scheduleKind).toBe("daily");
    expect(schedule?.syncState).toBe("synced");

    const dose = await doseEvent.get("dose-1");
    expect(dose?.scheduledAt).toBe("2026-01-01T08:00:00.000Z");
    expect(dose?.syncState).toBe("synced");
  });

  it("stops paging once a page comes back empty", async () => {
    let calls = 0;
    const pullChanges = async (): Promise<SyncChangesResponseBody> => {
      calls++;
      return { nextCursor: 0, changes: [] };
    };

    await hydrateLocalDataFromServer({ userMedication, medicationSchedule, doseEvent, pullChanges });
    expect(calls).toBe(1);
  });

  it("swallows a network failure rather than throwing", async () => {
    const pullChanges = async (): Promise<SyncChangesResponseBody> => {
      throw new Error("network down");
    };

    await expect(hydrateLocalDataFromServer({ userMedication, medicationSchedule, doseEvent, pullChanges })).resolves.toBeUndefined();
  });
});
