// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useTodayDoseEvents } from "@/components/today/use-today-dose-events";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";
import type { CreateDoseEventInput } from "@/lib/domain/dose-event";

const PROFILE_ID = "profile-1";
const NOON_TODAY = new Date("2026-03-10T12:00:00.000Z");

let db: MedTrackingDexie;

beforeEach(() => {
  db = new MedTrackingDexie(`test-today-dose-events-${crypto.randomUUID()}`);
  __setClientDbForTests(db);
  // Only fake setInterval/clearInterval/Date -- NOT setTimeout, which
  // both fake-indexeddb (to simulate async IDB operations) and
  // testing-library's own `waitFor` rely on internally. flushAsync()
  // below uses real setTimeout round trips instead of `waitFor` for
  // exactly this reason.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(NOON_TODAY);
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  __setClientDbForTests(undefined);
  await db.delete();
});

/** Lets real (unfaked) setTimeout-scheduled work -- every real Dexie/IndexedDB await in the hook under test -- actually run before asserting. */
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
    scheduledAt: NOON_TODAY.toISOString(),
    reminderAt: NOON_TODAY.toISOString(),
    quantityValue: "1",
    quantityUnit: "tablet",
    source: "manual_prn",
    clientMutationId: crypto.randomUUID(),
    ...overrides,
  };
}

describe("useTodayDoseEvents onNewlyDue", () => {
  it("never fires onNewlyDue for a dose that was already due at mount", async () => {
    const repo = new DexieDoseEventRepository(db);
    await repo.createIfMissing(doseInput({ scheduledAt: new Date(NOON_TODAY.getTime() - 60_000).toISOString() }));

    const onNewlyDue = vi.fn();
    const { result } = renderHook(() => useTodayDoseEvents(PROFILE_ID, onNewlyDue));

    await flushAsync();
    expect(result.current.status).toBe("ready");
    expect(onNewlyDue).not.toHaveBeenCalled();
  });

  it("fires onNewlyDue exactly once when a dose crosses into 'due now' during a later poll", async () => {
    const repo = new DexieDoseEventRepository(db);
    const futureDose = await repo.createIfMissing(doseInput({ scheduledAt: new Date(NOON_TODAY.getTime() + 60_000).toISOString() }));

    const onNewlyDue = vi.fn();
    const { result } = renderHook(() => useTodayDoseEvents(PROFILE_ID, onNewlyDue));

    await flushAsync();
    expect(result.current.status).toBe("ready");
    expect(onNewlyDue).not.toHaveBeenCalled();
    expect(result.current.todayDoses).toHaveLength(1);

    // Advance past the dose's scheduledAt, then let the periodic (faked) poll interval fire.
    vi.setSystemTime(new Date(NOON_TODAY.getTime() + 120_000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await flushAsync();

    expect(onNewlyDue).toHaveBeenCalledTimes(1);
    expect(onNewlyDue).toHaveBeenCalledWith(expect.objectContaining({ id: futureDose.id }));

    // A further poll tick with nothing new must not re-fire it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await flushAsync();
    expect(onNewlyDue).toHaveBeenCalledTimes(1);
  });

  it("never fires onNewlyDue for an already-terminal dose, even once its scheduled time passes", async () => {
    const repo = new DexieDoseEventRepository(db);
    const dose = await repo.createIfMissing(doseInput({ scheduledAt: new Date(NOON_TODAY.getTime() + 60_000).toISOString() }));
    await repo.transition(dose.id, { status: "skipped" }, crypto.randomUUID());

    const onNewlyDue = vi.fn();
    const { result } = renderHook(() => useTodayDoseEvents(PROFILE_ID, onNewlyDue));
    await flushAsync();
    expect(result.current.status).toBe("ready");

    vi.setSystemTime(new Date(NOON_TODAY.getTime() + 120_000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await flushAsync();

    expect(onNewlyDue).not.toHaveBeenCalled();
  });

  it("works with no onNewlyDue callback at all (optional parameter)", async () => {
    const repo = new DexieDoseEventRepository(db);
    await repo.createIfMissing(doseInput());

    const { result } = renderHook(() => useTodayDoseEvents(PROFILE_ID));
    await flushAsync();

    expect(result.current.status).toBe("ready");
    expect(result.current.todayDoses).toHaveLength(1);
  });
});
