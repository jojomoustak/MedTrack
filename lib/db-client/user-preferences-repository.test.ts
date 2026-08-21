import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexiePreferencesRepository } from "@/lib/db-client/user-preferences-repository";

describe("DexiePreferencesRepository (LWW)", () => {
  let db: MedTrackingDexie;
  let repo: DexiePreferencesRepository;
  let outbox: DexieOutboxRepository;
  const accountId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    db = new MedTrackingDexie(`test-prefs-${crypto.randomUUID()}`);
    outbox = new DexieOutboxRepository(db);
    repo = new DexiePreferencesRepository(db, outbox);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("get() returns null before any local write", async () => {
    expect(await repo.get(accountId)).toBeNull();
  });

  it("update() writes the record AND enqueues an outbox entry in the same local transaction (designing-offline-sync)", async () => {
    const updated = await repo.update(accountId, { theme: "dark" });

    expect(updated.theme).toBe("dark");
    expect(updated.syncState).toBe("pending");
    expect(updated.clientUpdatedAt).not.toBeNull();

    const stored = await repo.get(accountId);
    expect(stored?.theme).toBe("dark");

    const pending = await outbox.listPending(new Date().toISOString());
    expect(pending).toHaveLength(1);
    expect(pending[0].entityType).toBe("userPreferences");
    expect(pending[0].entityId).toBe(accountId);
    expect((pending[0].payload as { theme?: string }).theme).toBe("dark");
  });

  it("update() applies defaults on first write and merges patches on subsequent writes", async () => {
    const first = await repo.update(accountId, { theme: "dark" });
    expect(first.language).toBe("el"); // default preserved

    const second = await repo.update(accountId, { language: "en" });
    expect(second.theme).toBe("dark"); // previous edit preserved
    expect(second.language).toBe("en");
  });

  it("applyRemote() marks the record synced and never creates an outbox entry (it's the ack/pull path, not a new local edit)", async () => {
    await repo.update(accountId, { theme: "dark" });
    await outbox.markSynced((await outbox.listPending(new Date().toISOString()))[0].clientMutationId);

    await repo.applyRemote({
      accountId,
      theme: "light",
      language: "el",
      reminderDefaultSnoozeMinutes: 10,
      accessibilityTextScale: "1.00",
      updatedAt: new Date().toISOString(),
      clientUpdatedAt: new Date().toISOString(),
      syncState: "pending", // deliberately wrong input — applyRemote must normalize to "synced"
    });

    const stored = await repo.get(accountId);
    expect(stored?.syncState).toBe("synced");
    expect(stored?.theme).toBe("light");
    expect(await outbox.listPending(new Date().toISOString())).toHaveLength(0);
  });
});
