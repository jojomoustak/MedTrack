// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let finishPass: () => void = () => {};
const hydrate = vi.fn<(deps: unknown) => Promise<void>>(() => new Promise<void>((resolve) => (finishPass = resolve)));
vi.mock("@/lib/sync/client/hydrate-local-data", () => ({ hydrateLocalDataFromServer: (deps: unknown) => hydrate(deps) }));

const { catchUpWithServer, __resetCatchUpForTests } = await import("@/lib/sync/client/catch-up");

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  __resetCatchUpForTests();
  hydrate.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// 2026-10-19: only the medicines screens caught up, so Lists opened first on a new phone stayed empty.
describe("catchUpWithServer", () => {
  it("starts one pass for the profile, and a second ask meanwhile shares it", async () => {
    const first = catchUpWithServer("profile-1");
    const second = catchUpWithServer("profile-1");

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledWith({ profileId: "profile-1" });
    finishPass();
    await first;
  });

  it("doesn't ask the server again within a minute, but does after", async () => {
    const pass = catchUpWithServer("profile-1");
    finishPass();
    await pass;

    vi.setSystemTime(Date.now() + 59_000);
    expect(catchUpWithServer("profile-1")).toBeNull();

    vi.setSystemTime(Date.now() + 2_000);
    expect(catchUpWithServer("profile-1")).not.toBeNull();
    expect(hydrate).toHaveBeenCalledTimes(2);
  });

  it("catches up again when the app comes back to the foreground", async () => {
    const pass = catchUpWithServer("profile-1");
    finishPass();
    await pass;
    expect(catchUpWithServer("profile-1")).toBeNull();

    setVisibility("hidden");
    setVisibility("visible");

    expect(catchUpWithServer("profile-1")).not.toBeNull();
    expect(hydrate).toHaveBeenCalledTimes(2);
  });

  it("keeps each profile to its own minute", async () => {
    const pass = catchUpWithServer("profile-1");
    finishPass();
    await pass;

    expect(catchUpWithServer("profile-2")).not.toBeNull();
    expect(hydrate).toHaveBeenLastCalledWith({ profileId: "profile-2" });
  });
});
