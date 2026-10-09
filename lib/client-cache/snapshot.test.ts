// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearSnapshots, keepIfSame, readSnapshot, refreshSnapshot, writeSnapshot } from "@/lib/client-cache/snapshot";
import { notifyOutboxWrite } from "@/lib/sync/client/outbox-signal";
import { notifyLocalDataHydrated } from "@/lib/sync/client/local-data-signal";

beforeEach(() => clearSnapshots());

describe("snapshot cache", () => {
  it("keeps the previous object when a re-read finds the same content, so nothing downstream redraws", () => {
    const previous = [{ id: "a", version: 1 }];
    expect(keepIfSame(previous, [{ id: "a", version: 1 }])).toBe(previous);
  });

  it("takes the new value when anything changed", () => {
    const next = [{ id: "a", version: 2 }];
    expect(keepIfSame([{ id: "a", version: 1 }], next)).toBe(next);
    expect(keepIfSame(undefined, next)).toBe(next);
  });

  it("refreshSnapshot stores the settled value and returns it", () => {
    const first = refreshSnapshot("k", [1, 2]);
    expect(refreshSnapshot("k", [1, 2])).toBe(first);
    const changed = refreshSnapshot("k", [1, 3]);
    expect(changed).toEqual([1, 3]);
    expect(readSnapshot("k")).toBe(changed);
  });

  it("a local write forgets only the screens it can make out of date", () => {
    writeSnapshot("today-doses:p:day", [1]);
    writeSnapshot("medications:p", [2]);
    writeSnapshot("purchase-lists:p", [3]);
    notifyOutboxWrite("doseEvent");
    expect(readSnapshot("today-doses:p:day")).toBeUndefined();
    expect(readSnapshot("medications:p")).toEqual([2]);
    expect(readSnapshot("purchase-lists:p")).toEqual([3]);

    notifyOutboxWrite("userMedication");
    expect(readSnapshot("medications:p")).toBeUndefined();
    expect(readSnapshot("purchase-lists:p")).toEqual([3]);

    notifyOutboxWrite("someFutureEntity");
    expect(readSnapshot("purchase-lists:p")).toBeUndefined();
  });

  it("data arriving from the server forgets everything", () => {
    writeSnapshot("medications:p", [2]);
    notifyLocalDataHydrated("pull");
    expect(readSnapshot("medications:p")).toBeUndefined();
  });

  it("clearSnapshots forgets everything (sign-out, account deletion)", () => {
    writeSnapshot("medications:profile-1", [{ id: "a" }]);
    clearSnapshots();
    expect(readSnapshot("medications:profile-1")).toBeUndefined();
  });
});
