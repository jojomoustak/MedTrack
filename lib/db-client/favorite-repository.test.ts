import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MedTrackingDexie } from "@/lib/db-client/dexie";
import { DexieOutboxRepository } from "@/lib/db-client/outbox-repository";
import { DexieFavoriteRepository } from "@/lib/db-client/favorite-repository";

const PROFILE_ID = "profile-1";
const MED_ID = "med-1";

describe("DexieFavoriteRepository", () => {
  let db: MedTrackingDexie;
  let repo: DexieFavoriteRepository;

  beforeEach(() => {
    db = new MedTrackingDexie(`test-favorite-${crypto.randomUUID()}`);
    repo = new DexieFavoriteRepository(db, new DexieOutboxRepository(db));
  });

  afterEach(async () => {
    await db.delete();
  });

  it("get() returns null when a medication has never been favorited", async () => {
    expect(await repo.get(PROFILE_ID, MED_ID)).toBeNull();
  });

  it("toggle() creates a new row on the first call, favorited (removedAt null)", async () => {
    const favorite = await repo.toggle(PROFILE_ID, MED_ID, crypto.randomUUID());
    expect(favorite.removedAt).toBeNull();
    expect(favorite.profileId).toBe(PROFILE_ID);
    expect(favorite.userMedicationId).toBe(MED_ID);
    expect(favorite.syncState).toBe("pending");
  });

  it("toggle()'s id is deterministic — a second, never-synced device favoriting the same medication computes the SAME id, not a random one", async () => {
    // Simulates two devices, each with its own fresh local DB, both
    // favoriting the same medication for the first time before either has
    // ever synced with the other — the exact race `deriveFavoriteId`'s doc
    // exists to avoid.
    const otherDeviceDb = new MedTrackingDexie(`test-favorite-other-device-${crypto.randomUUID()}`);
    const otherDeviceRepo = new DexieFavoriteRepository(otherDeviceDb, new DexieOutboxRepository(otherDeviceDb));

    const thisDevice = await repo.toggle(PROFILE_ID, MED_ID, crypto.randomUUID());
    const otherDevice = await otherDeviceRepo.toggle(PROFILE_ID, MED_ID, crypto.randomUUID());

    expect(otherDevice.id).toBe(thisDevice.id);
    await otherDeviceDb.delete();
  });

  it("toggle() flips the SAME row's removedAt on the second call — never creates a second row", async () => {
    const first = await repo.toggle(PROFILE_ID, MED_ID, crypto.randomUUID());
    const second = await repo.toggle(PROFILE_ID, MED_ID, crypto.randomUUID());

    expect(second.id).toBe(first.id); // same row, per Phase 2 §2.10's "toggle-off tombstone, not a row delete"
    expect(second.removedAt).not.toBeNull();

    const all = await db.favorite.toArray();
    expect(all).toHaveLength(1);
  });

  it("toggle() a third time re-favorites (removedAt back to null)", async () => {
    await repo.toggle(PROFILE_ID, MED_ID, crypto.randomUUID());
    await repo.toggle(PROFILE_ID, MED_ID, crypto.randomUUID());
    const third = await repo.toggle(PROFILE_ID, MED_ID, crypto.randomUUID());
    expect(third.removedAt).toBeNull();
  });

  it("listActive() only returns currently-favorited rows for this profile", async () => {
    await repo.toggle(PROFILE_ID, "med-a", crypto.randomUUID());
    await repo.toggle(PROFILE_ID, "med-b", crypto.randomUUID());
    await repo.toggle(PROFILE_ID, "med-b", crypto.randomUUID()); // un-favorite med-b
    await repo.toggle("other-profile", "med-c", crypto.randomUUID());

    const active = await repo.listActive(PROFILE_ID);
    expect(active.map((f) => f.userMedicationId)).toEqual(["med-a"]);
  });

  it("enqueues exactly one outbox entry per toggle, in the same transaction", async () => {
    await repo.toggle(PROFILE_ID, MED_ID, crypto.randomUUID());
    const pending = await db.outbox.where("entityType").equals("favorite").toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe("create");

    await repo.toggle(PROFILE_ID, MED_ID, crypto.randomUUID());
    const afterSecond = await db.outbox.where("entityType").equals("favorite").sortBy("seq");
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond[1].operation).toBe("update");
  });

  it("applyRemote() marks the row synced without creating a new outbox entry", async () => {
    const favorite = await repo.toggle(PROFILE_ID, MED_ID, crypto.randomUUID());
    const countBefore = (await db.outbox.toArray()).length;

    await repo.applyRemote({ ...favorite, syncState: "pending" });

    const stored = await db.favorite.get(favorite.id);
    expect(stored?.syncState).toBe("synced");
    expect((await db.outbox.toArray()).length).toBe(countBefore);
  });

  it("markFailed() sets syncState to failed", async () => {
    const favorite = await repo.toggle(PROFILE_ID, MED_ID, crypto.randomUUID());
    await repo.markFailed(favorite.id);
    const stored = await db.favorite.get(favorite.id);
    expect(stored?.syncState).toBe("failed");
  });
});
