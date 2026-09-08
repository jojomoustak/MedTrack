// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useDoseEventsForRange } from "@/components/calendar/use-dose-events-for-range";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";
import type { CreateDoseEventInput } from "@/lib/domain/dose-event";
import type { CreateMedicationScheduleInput } from "@/lib/domain/medication-schedule";

const PROFILE_ID = "profile-1";
const NOW = new Date("2026-03-10T12:00:00.000Z");

let db: MedTrackingDexie;

beforeEach(() => {
  db = new MedTrackingDexie(`test-range-${crypto.randomUUID()}`);
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

describe("useDoseEventsForRange", () => {
  it("returns real materialized doses within the range, sorted ascending", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const doseRepo = new DexieDoseEventRepository(db);
    await doseRepo.createIfMissing(doseInput({ scheduledAt: new Date(NOW.getTime() + 3_600_000).toISOString() }));
    await doseRepo.createIfMissing(doseInput({ scheduledAt: NOW.toISOString() }));

    const { result } = renderHook(() => useDoseEventsForRange(PROFILE_ID, new Date(NOW.getTime() - 3_600_000), new Date(NOW.getTime() + 3_600_000)));
    await flushAsync();

    expect(result.current.status).toBe("ready");
    expect(result.current.doses).toHaveLength(2);
    expect(result.current.doses[0].scheduledAt).toBe(NOW.toISOString());
  });

  it("projects instants beyond the materialization horizon, never real ones within it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const scheduleRepo = new DexieMedicationScheduleRepository(db);
    await scheduleRepo.create(scheduleInput());

    // A range extending 10 days out — far past GENERATION_HORIZON_MS (72h).
    const from = new Date(NOW);
    const to = new Date(NOW.getTime() + 10 * 24 * 3_600_000);
    const { result } = renderHook(() => useDoseEventsForRange(PROFILE_ID, from, to));
    await flushAsync();

    expect(result.current.status).toBe("ready");
    expect(result.current.doses).toHaveLength(0); // nothing materialized yet — no generator ran
    expect(result.current.projected.length).toBeGreaterThan(0);
    // Every projected instant is a plain instant — no id/status field exists to act on.
    expect(result.current.projected[0]).not.toHaveProperty("id");
    expect(result.current.projected[0]).not.toHaveProperty("status");
  });

  it("projects nothing when the whole range is within the materialization horizon", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const scheduleRepo = new DexieMedicationScheduleRepository(db);
    await scheduleRepo.create(scheduleInput());

    const from = new Date(NOW);
    const to = new Date(NOW.getTime() + 24 * 3_600_000); // 1 day — well inside the 72h horizon
    const { result } = renderHook(() => useDoseEventsForRange(PROFILE_ID, from, to));
    await flushAsync();

    expect(result.current.status).toBe("ready");
    expect(result.current.projected).toEqual([]);
  });
});
