// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useDoseSummaryForMonth, daySummaryToMarkerKind } from "@/components/calendar/use-dose-summary-for-month";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";
import type { CreateDoseEventInput } from "@/lib/domain/dose-event";
import type { CreateMedicationScheduleInput } from "@/lib/domain/medication-schedule";

const PROFILE_ID = "profile-1";
const NOW = new Date("2026-03-10T12:00:00.000Z");

let db: MedTrackingDexie;

beforeEach(() => {
  db = new MedTrackingDexie(`test-month-summary-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  __setClientDbForTests(undefined);
  await db.delete();
});

async function flushAsync(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function doseInput(overrides: Partial<CreateDoseEventInput> = {}): CreateDoseEventInput {
  return {
    id: crypto.randomUUID(),
    profileId: PROFILE_ID,
    userMedicationId: "med-1",
    scheduleId: null,
    scheduledAt: NOW.toISOString(),
    reminderAt: NOW.toISOString(),
    quantityValue: "1",
    quantityUnit: "tablet",
    source: "manual_prn",
    notes: null,
    clientMutationId: crypto.randomUUID(),
    ...overrides,
  };
}

function scheduleInput(overrides: Partial<CreateMedicationScheduleInput> = {}): CreateMedicationScheduleInput {
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

describe("useDoseSummaryForMonth", () => {
  it("picks the worst status when a day has more than one real dose", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const doseRepo = new DexieDoseEventRepository(db);
    const taken = await doseRepo.createIfMissing(doseInput({ scheduledAt: new Date(NOW.getTime() - 3_600_000).toISOString() }));
    await doseRepo.transition(taken.id, { status: "taken", takenAt: NOW.toISOString() }, crypto.randomUUID());
    const missed = await doseRepo.createIfMissing(doseInput({ scheduledAt: new Date(NOW.getTime() - 1_800_000).toISOString() }));
    await doseRepo.transition(missed.id, { status: "missed" }, crypto.randomUUID());

    const { result } = renderHook(() => useDoseSummaryForMonth(PROFILE_ID, NOW));
    await flushAsync();

    expect(result.current.status).toBe("ready");
    const summary = result.current.byDay.get(NOW.toDateString());
    expect(summary).toBeDefined();
    expect(summary!.kind).toBe("real");
    expect(summary!.worstStatus).toBe("missed");
    expect(summary!.doseCount).toBe(2);
    expect(daySummaryToMarkerKind(summary!)).toBe("missed");
  });

  it("marks a day beyond the horizon as projected when it has no real doses", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const scheduleRepo = new DexieMedicationScheduleRepository(db);
    await scheduleRepo.create(scheduleInput());

    const { result } = renderHook(() => useDoseSummaryForMonth(PROFILE_ID, NOW));
    await flushAsync();

    // Some day near the end of March 2026 is well beyond the 72h horizon.
    const farDay = new Date(2026, 2, 25);
    const summary = result.current.byDay.get(farDay.toDateString());
    expect(summary?.kind).toBe("projected");
    expect(daySummaryToMarkerKind(summary!)).toBe("projected");
  });

  it("returns no entry (empty) for a day with neither real nor projected doses", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);

    const { result } = renderHook(() => useDoseSummaryForMonth(PROFILE_ID, NOW));
    await flushAsync();

    const emptyDay = new Date(2026, 2, 1);
    expect(result.current.byDay.get(emptyDay.toDateString())).toBeUndefined();
  });
});
