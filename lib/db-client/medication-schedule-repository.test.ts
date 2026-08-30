import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import type { CreateMedicationScheduleInput } from "@/lib/domain/medication-schedule";

function dailyInput(overrides: Partial<CreateMedicationScheduleInput> = {}): CreateMedicationScheduleInput {
  return {
    id: crypto.randomUUID(),
    profileId: "profile-1",
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

describe("DexieMedicationScheduleRepository (optimistic concurrency)", () => {
  let db: MedTrackingDexie;
  let repo: DexieMedicationScheduleRepository;
  let outbox: DexieOutboxRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-schedule-${crypto.randomUUID()}`);
    outbox = new DexieOutboxRepository(db);
    repo = new DexieMedicationScheduleRepository(db, outbox);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("create() derives timeAnchor from scheduleKind and writes a create outbox entry", async () => {
    const input = dailyInput();
    const record = await repo.create(input);

    expect(record.timeAnchor).toBe("wall_clock");
    expect(record.version).toBe(1);
    expect(record.syncState).toBe("pending");

    const pending = await outbox.listPending(new Date().toISOString());
    expect(pending).toHaveLength(1);
    expect(pending[0].entityType).toBe("medicationSchedule");
    expect(pending[0].operation).toBe("create");
    expect(pending[0].baseVersion).toBeUndefined();
  });

  it("create() for every_n_hours derives timeAnchor 'elapsed'", async () => {
    const record = await repo.create(
      dailyInput({ scheduleKind: "every_n_hours", timesOfDay: null, intervalHours: 8, anchorAt: new Date().toISOString() }),
    );
    expect(record.timeAnchor).toBe("elapsed");
  });

  it("create() for prn derives timeAnchor null", async () => {
    const record = await repo.create(dailyInput({ scheduleKind: "prn", timesOfDay: null }));
    expect(record.timeAnchor).toBeNull();
  });

  it("update() bumps version locally and enqueues an update mutation carrying baseVersion", async () => {
    const created = await repo.create(dailyInput());
    const updated = await repo.update(created.id, { timesOfDay: ["09:00:00"] }, crypto.randomUUID());

    expect(updated.version).toBe(2);
    expect(updated.timesOfDay).toEqual(["09:00:00"]);

    const pending = await outbox.listPending(new Date().toISOString());
    const updateEntry = pending.find((e) => e.operation === "update");
    expect(updateEntry?.baseVersion).toBe(1);
  });

  it("softDelete() sets deletedAt and excludes the row from list()", async () => {
    const created = await repo.create(dailyInput());
    await repo.softDelete(created.id, crypto.randomUUID());

    const list = await repo.list("profile-1");
    expect(list).toHaveLength(0);

    const raw = await repo.get(created.id);
    expect(raw?.deletedAt).not.toBeNull();
  });

  it("listByUserMedication() scopes correctly", async () => {
    await repo.create(dailyInput({ userMedicationId: "med-a" }));
    await repo.create(dailyInput({ userMedicationId: "med-b" }));

    const forA = await repo.listByUserMedication("med-a");
    expect(forA).toHaveLength(1);
    expect(forA[0].userMedicationId).toBe("med-a");
  });

  it("applyRemote()/markConflict()/markFailed() update syncState", async () => {
    const created = await repo.create(dailyInput());

    await repo.markConflict(created.id);
    expect((await repo.get(created.id))?.syncState).toBe("conflict");

    await repo.markFailed(created.id);
    expect((await repo.get(created.id))?.syncState).toBe("failed");

    await repo.applyRemote({ ...created, version: 5, syncState: "pending" });
    const final = await repo.get(created.id);
    expect(final?.syncState).toBe("synced");
    expect(final?.version).toBe(5);
  });
});
