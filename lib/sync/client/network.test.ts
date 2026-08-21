// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNetworkMonitor } from "@/lib/sync/client/network";

describe("createNetworkMonitor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports 'offline' when navigator.onLine is false, without even attempting a fetch", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    const fetchImpl = vi.fn();
    const monitor = createNetworkMonitor({ fetchImpl });

    const state = await monitor.checkNow();

    expect(state).toBe("offline");
    expect(fetchImpl).not.toHaveBeenCalled();
    monitor.stop();
  });

  it("reports 'online' when the health check succeeds", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const monitor = createNetworkMonitor({ fetchImpl });

    const state = await monitor.checkNow();

    expect(state).toBe("online");
    monitor.stop();
  });

  it("reports 'backend-unreachable' — distinct from 'offline' — when the device is online but the health check fails (Phase 1 §11)", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const monitor = createNetworkMonitor({ fetchImpl });

    const state = await monitor.checkNow();

    expect(state).toBe("backend-unreachable");
    monitor.stop();
  });

  it("reports 'backend-unreachable' when the health check responds but with a non-OK status", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const monitor = createNetworkMonitor({ fetchImpl });

    const state = await monitor.checkNow();

    expect(state).toBe("backend-unreachable");
    monitor.stop();
  });

  it("notifies subscribers only when the state actually changes", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const monitor = createNetworkMonitor({ fetchImpl });
    const listener = vi.fn();
    monitor.subscribe(listener);

    await monitor.checkNow(); // online -> online, no change
    expect(listener).not.toHaveBeenCalled();

    fetchImpl.mockRejectedValueOnce(new TypeError("fail"));
    await monitor.checkNow(); // online -> backend-unreachable
    expect(listener).toHaveBeenCalledWith("backend-unreachable");

    monitor.stop();
  });

  it("reacts to the browser 'offline' event immediately, without waiting for the poll interval", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const monitor = createNetworkMonitor({ fetchImpl, intervalMs: 60_000 });
    monitor.start();
    await Promise.resolve();

    window.dispatchEvent(new Event("offline"));

    expect(monitor.getState()).toBe("offline");
    monitor.stop();
  });

  it("start() is idempotent — calling it twice doesn't register duplicate listeners/intervals", () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const addSpy = vi.spyOn(window, "addEventListener");
    const monitor = createNetworkMonitor({ fetchImpl });

    monitor.start();
    monitor.start();

    const onlineListenerCalls = addSpy.mock.calls.filter(([type]) => type === "online").length;
    expect(onlineListenerCalls).toBe(1);
    monitor.stop();
  });
});
