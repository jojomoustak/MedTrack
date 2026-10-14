// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { isDoseDue, recordAllDosesTaken, recordDoseSkipped, recordDoseTaken } from "@/lib/doses/client/dose-actions";
import type { CreateDoseEventInput, DoseEventRecord } from "@/lib/domain/dose-event";

// Inside the Android app: records what the native reminder layer is told.
const native = vi.hoisted(() => ({ cancelled: [] as string[] }));
vi.mock("@/lib/platform/median-mobile-platform", () => ({
  MedianMobilePlatform: class {
    isAvailable() {
      return true;
    }
    async cancelRemindersForDoseEvent(doseEventId: string) {
      native.cancelled.push(doseEventId);
      return { status: "ok" };
    }
    async upsertReminder() {
      return { status: "ok" };
    }
  },
}));

const PROFILE_ID = "profile-1";
const NOW = new Date("2026-10-11T12:31:00.000Z"); // 15:31 in Athens
let db: MedTrackingDexie;

function doseAt(iso: string): CreateDoseEventInput {
  return {
    id: crypto.randomUUID(),
    profileId: PROFILE_ID,
    userMedicationId: "med-1",
    scheduleId: null,
    scheduledAt: iso,
    reminderAt: iso,
    quantityValue: "1",
    quantityUnit: "tablet",
    source: "manual_prn",
    notes: null,
    clientMutationId: crypto.randomUUID(),
  };
}

beforeEach(() => {
  native.cancelled.length = 0;
  db = new MedTrackingDexie(`test-dose-actions-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
});

afterEach(async () => {
  __setClientDbForTests(undefined);
  await db.delete();
});

describe("mark all as taken covers only doses that are due (2026-10-11)", () => {
  it("is due once its time has come, or within the next hour — never later in the day", () => {
    const pending = (iso: string) => ({ status: "scheduled", scheduledAt: iso }) as Pick<DoseEventRecord, "status" | "scheduledAt">;
    expect(isDoseDue(pending("2026-10-11T06:01:00.000Z"), NOW)).toBe(true); // this morning
    expect(isDoseDue(pending("2026-10-11T13:20:00.000Z"), NOW)).toBe(true); // in 49 minutes
    expect(isDoseDue(pending("2026-10-11T15:57:00.000Z"), NOW)).toBe(false); // 18:57 this evening
    expect(isDoseDue({ status: "missed", scheduledAt: "2026-10-11T06:01:00.000Z" }, NOW)).toBe(false); // missed is recorded separately ("taken later")
  });

  it("records the due doses and leaves this evening's untouched — the bug found on the owner's phone", async () => {
    const repo = new DexieDoseEventRepository(db);
    const morning = await repo.createIfMissing(doseAt("2026-10-11T06:01:00.000Z"));
    const soon = await repo.createIfMissing(doseAt("2026-10-11T13:20:00.000Z"));
    const evening = await repo.createIfMissing(doseAt("2026-10-11T15:57:00.000Z"));

    await recordAllDosesTaken([morning, soon, evening], PROFILE_ID, NOW);

    expect((await repo.get(morning.id))?.status).toBe("taken");
    expect((await repo.get(soon.id))?.status).toBe("taken");
    expect((await repo.get(evening.id))?.status).toBe("scheduled");
  });
});

describe("a finished dose clears its reminder notification (2026-10-14)", () => {
  // The notification can't be swiped away, and the reminder refresh only looks back 2 hours.
  it("by id, even for a dose that rang hours ago", async () => {
    const repo = new DexieDoseEventRepository(db);
    const longAgo = new Date(Date.now() - 5 * 3_600_000).toISOString();
    const dose = await repo.createIfMissing(doseAt(longAgo));

    await recordDoseTaken(dose.id, PROFILE_ID);

    await vi.waitFor(() => expect(native.cancelled).toContain(dose.id));
  });

  it("for a skipped dose too", async () => {
    const repo = new DexieDoseEventRepository(db);
    const dose = await repo.createIfMissing(doseAt(new Date().toISOString()));

    await recordDoseSkipped(dose.id, PROFILE_ID);

    await vi.waitFor(() => expect(native.cancelled).toContain(dose.id));
  });
});
