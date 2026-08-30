import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import type { CreateDoseEventInput } from "@/lib/domain/dose-event";

function scheduledInput(overrides: Partial<CreateDoseEventInput> = {}): CreateDoseEventInput {
  return {
    id: crypto.randomUUID(),
    profileId: "profile-1",
    userMedicationId: "med-1",
    scheduleId: "schedule-1",
    scheduledAt: "2026-09-01T05:00:00.000Z",
    reminderAt: "2026-09-01T05:00:00.000Z",
    quantityValue: "1",
    quantityUnit: "tablet",
    source: "schedule_generated",
    clientMutationId: crypto.randomUUID(),
    ...overrides,
  };
}

describe("DexieDoseEventRepository (idempotent-by-id)", () => {
  let db: MedTrackingDexie;
  let repo: DexieDoseEventRepository;
  let outbox: DexieOutboxRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-doseevent-${crypto.randomUUID()}`);
    outbox = new DexieOutboxRepository(db);
    repo = new DexieDoseEventRepository(db, outbox);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("createIfMissing() writes the record (status 'scheduled') and a create outbox entry with no baseVersion", async () => {
    const input = scheduledInput();
    const record = await repo.createIfMissing(input);

    expect(record.status).toBe("scheduled");
    expect(record.snoozeCount).toBe(0);
    expect(record.syncState).toBe("pending");

    const pending = await outbox.listPending(new Date().toISOString());
    expect(pending).toHaveLength(1);
    expect(pending[0].entityType).toBe("doseEvent");
    expect(pending[0].baseVersion).toBeUndefined();
  });

  it("createIfMissing() is a true no-op (no duplicate outbox entry) when the id already exists", async () => {
    const input = scheduledInput();
    await repo.createIfMissing(input);
    await repo.createIfMissing(input);

    const pending = await outbox.listPending(new Date().toISOString());
    expect(pending).toHaveLength(1);
  });

  it("transition() to 'taken' sets takenAt and enqueues an update mutation with no baseVersion", async () => {
    const input = scheduledInput();
    const created = await repo.createIfMissing(input);
    const takenAt = new Date().toISOString();

    const updated = await repo.transition(created.id, { status: "taken", takenAt }, crypto.randomUUID());

    expect(updated.status).toBe("taken");
    expect(updated.takenAt).toBe(takenAt);

    const pending = await outbox.listPending(new Date().toISOString());
    const transitionEntry = pending.find((e) => e.operation === "update");
    expect(transitionEntry?.baseVersion).toBeUndefined();
  });

  it("transition() to 'snoozed' increments snoozeCount each time", async () => {
    const created = await repo.createIfMissing(scheduledInput());
    const first = await repo.transition(created.id, { status: "snoozed" }, crypto.randomUUID());
    expect(first.snoozeCount).toBe(1);

    // Snoozed is non-terminal, so a second snooze is a valid transition.
    const second = await repo.transition(created.id, { status: "snoozed" }, crypto.randomUUID());
    expect(second.snoozeCount).toBe(2);
  });

  it("transition() throws (enqueues nothing) when the local row is already terminal", async () => {
    const created = await repo.createIfMissing(scheduledInput());
    await repo.transition(created.id, { status: "taken", takenAt: new Date().toISOString() }, crypto.randomUUID());

    const pendingBefore = await outbox.listPending(new Date().toISOString());
    await expect(repo.transition(created.id, { status: "skipped" }, crypto.randomUUID())).rejects.toThrow(/already terminal/);
    const pendingAfter = await outbox.listPending(new Date().toISOString());
    expect(pendingAfter).toHaveLength(pendingBefore.length);
  });

  it("listForProfileInRange() finds dose events whose scheduledAt falls within the range", async () => {
    await repo.createIfMissing(scheduledInput({ id: crypto.randomUUID(), scheduledAt: "2026-09-01T05:00:00.000Z" }));
    await repo.createIfMissing(scheduledInput({ id: crypto.randomUUID(), scheduledAt: "2026-09-10T05:00:00.000Z" }));

    const inRange = await repo.listForProfileInRange("profile-1", "2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z");
    expect(inRange).toHaveLength(1);
  });

  it("listByScheduleId() scopes correctly", async () => {
    await repo.createIfMissing(scheduledInput({ id: crypto.randomUUID(), scheduleId: "schedule-a" }));
    await repo.createIfMissing(scheduledInput({ id: crypto.randomUUID(), scheduleId: "schedule-b" }));

    const forA = await repo.listByScheduleId("schedule-a");
    expect(forA).toHaveLength(1);
  });

  it("listNonTerminalBefore() only returns non-terminal rows scheduled before the cutoff", async () => {
    const past = await repo.createIfMissing(scheduledInput({ id: crypto.randomUUID(), scheduledAt: "2026-09-01T05:00:00.000Z" }));
    const future = await repo.createIfMissing(scheduledInput({ id: crypto.randomUUID(), scheduledAt: "2026-09-10T05:00:00.000Z" }));
    const takenPast = await repo.createIfMissing(scheduledInput({ id: crypto.randomUUID(), scheduledAt: "2026-08-01T05:00:00.000Z" }));
    await repo.transition(takenPast.id, { status: "taken", takenAt: new Date().toISOString() }, crypto.randomUUID());

    const cutoff = "2026-09-05T00:00:00.000Z";
    const overdue = await repo.listNonTerminalBefore("profile-1", cutoff);

    expect(overdue.map((r) => r.id)).toEqual([past.id]);
    expect(overdue.map((r) => r.id)).not.toContain(future.id);
    expect(overdue.map((r) => r.id)).not.toContain(takenPast.id);
  });

  it("applyRemote() converges a non-terminal local row to the server's record", async () => {
    const created = await repo.createIfMissing(scheduledInput());
    await repo.applyRemote({ ...created, status: "taken", takenAt: new Date().toISOString(), syncState: "pending" });

    const final = await repo.get(created.id);
    expect(final?.status).toBe("taken");
    expect(final?.syncState).toBe("synced");
  });

  it("applyRemote() does not regress an already-terminal local row to a non-terminal pulled record", async () => {
    const created = await repo.createIfMissing(scheduledInput());
    await repo.transition(created.id, { status: "skipped" }, crypto.randomUUID());

    // Simulates a stale pulled row (e.g. from before this device's own
    // not-yet-synced transition landed server-side).
    await repo.applyRemote({ ...created, status: "scheduled", syncState: "pending" });

    const final = await repo.get(created.id);
    expect(final?.status).toBe("skipped");
    expect(final?.syncState).toBe("synced");
  });

  it("markFailed() sets syncState without touching status", async () => {
    const created = await repo.createIfMissing(scheduledInput());
    await repo.markFailed(created.id);
    const final = await repo.get(created.id);
    expect(final?.syncState).toBe("failed");
    expect(final?.status).toBe("scheduled");
  });
});
