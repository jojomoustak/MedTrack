import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexieRecentlyUsedEventRepository } from "@/lib/db-client/recently-used-event-repository";
import type { CreateRecentlyUsedEventInput } from "@/lib/domain/recently-used-event";

const PROFILE_ID = "profile-1";

function eventInput(overrides: Partial<CreateRecentlyUsedEventInput> = {}): CreateRecentlyUsedEventInput {
  return {
    id: crypto.randomUUID(),
    profileId: PROFILE_ID,
    userMedicationId: "med-1",
    interactionType: "viewed",
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("DexieRecentlyUsedEventRepository", () => {
  let db: MedTrackingDexie;
  let repo: DexieRecentlyUsedEventRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-recent-${crypto.randomUUID()}`);
    repo = new DexieRecentlyUsedEventRepository(db, new DexieOutboxRepository(db));
  });

  afterEach(async () => {
    await db.delete();
  });

  it("record() creates a new event and enqueues one outbox entry", async () => {
    const event = await repo.record(eventInput());
    expect(event.syncState).toBe("pending");

    const pending = await db.outbox.where("entityType").equals("recentlyUsedEvent").toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe("create");
  });

  it("record() is idempotent-by-id — a retry with the same id doesn't duplicate the row or the outbox entry", async () => {
    const input = eventInput();
    const first = await repo.record(input);
    const second = await repo.record(input);

    expect(second.id).toBe(first.id);
    expect(await db.recentlyUsedEvent.toArray()).toHaveLength(1);
    expect((await db.outbox.where("entityType").equals("recentlyUsedEvent").toArray()).length).toBe(1);
  });

  it("listRecent() returns most-recent-first, capped at the given limit", async () => {
    const base = Date.now();
    for (let i = 0; i < 5; i++) {
      await repo.record(eventInput({ id: crypto.randomUUID(), occurredAt: new Date(base + i * 1000).toISOString() }));
    }

    const recent = await repo.listRecent(PROFILE_ID, 3);
    expect(recent).toHaveLength(3);
    // Descending by occurredAt.
    for (let i = 0; i < recent.length - 1; i++) {
      expect(recent[i].occurredAt >= recent[i + 1].occurredAt).toBe(true);
    }
  });

  it("listRecent() scopes to the given profile only", async () => {
    await repo.record(eventInput({ profileId: PROFILE_ID }));
    await repo.record(eventInput({ profileId: "other-profile" }));

    const recent = await repo.listRecent(PROFILE_ID, 10);
    expect(recent).toHaveLength(1);
    expect(recent[0].profileId).toBe(PROFILE_ID);
  });

  it("applyRemote() marks the row synced without creating a new outbox entry", async () => {
    const event = await repo.record(eventInput());
    const countBefore = (await db.outbox.toArray()).length;

    await repo.applyRemote({ ...event, syncState: "pending" });

    const stored = await db.recentlyUsedEvent.get(event.id);
    expect(stored?.syncState).toBe("synced");
    expect((await db.outbox.toArray()).length).toBe(countBefore);
  });

  it("markFailed() sets syncState to failed", async () => {
    const event = await repo.record(eventInput());
    await repo.markFailed(event.id);
    const stored = await db.recentlyUsedEvent.get(event.id);
    expect(stored?.syncState).toBe("failed");
  });
});
