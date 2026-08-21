/**
 * Network-state detection that distinguishes "no network" from "backend
 * unreachable" (Phase 1 §11's failure-mode table treats these as
 * genuinely different: one is an OS-level condition with nothing to
 * retry against yet, the other means the device IS online but
 * MedTracking's servers aren't reachable — different user-facing copy,
 * Phase 3 §8). `navigator.onLine` alone is not trusted at face value —
 * it only reflects OS/link-layer state, not whether the actual backend
 * responds — so a lightweight health-check ping backs it up.
 *
 * Client-only: touches `window`/`navigator`. Never imported from
 * server-side code.
 */
export type NetworkState = "online" | "offline" | "backend-unreachable";

export interface NetworkMonitorOptions {
  /** Defaults to the Phase 4 health-check endpoint — deliberately lightweight (no DB touch). */
  healthCheckUrl?: string;
  /** How often to re-check while online (ms). */
  intervalMs?: number;
  /** Timeout for a single health-check request (ms). */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface NetworkMonitor {
  getState(): NetworkState;
  subscribe(listener: (state: NetworkState) => void): () => void;
  /** Runs a check immediately, updates state, and returns it. */
  checkNow(): Promise<NetworkState>;
  start(): void;
  stop(): void;
}

const DEFAULTS = {
  healthCheckUrl: "/api/health",
  intervalMs: 30_000,
  timeoutMs: 5_000,
};

export function createNetworkMonitor(options: NetworkMonitorOptions = {}): NetworkMonitor {
  const healthCheckUrl = options.healthCheckUrl ?? DEFAULTS.healthCheckUrl;
  const intervalMs = options.intervalMs ?? DEFAULTS.intervalMs;
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const fetchImpl = options.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);

  let state: NetworkState = typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online";
  const listeners = new Set<(state: NetworkState) => void>();
  let intervalHandle: ReturnType<typeof setInterval> | undefined;

  function setState(next: NetworkState) {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener(state);
  }

  async function checkNow(): Promise<NetworkState> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setState("offline");
      return state;
    }
    if (!fetchImpl) {
      // No fetch available (e.g. a non-browser test context that didn't
      // inject one) — trust navigator.onLine alone.
      setState("online");
      return state;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(healthCheckUrl, { signal: controller.signal, cache: "no-store" });
      setState(response.ok ? "online" : "backend-unreachable");
    } catch {
      // A network-level failure while navigator says we're online means
      // the DEVICE has connectivity but MedTracking's backend doesn't
      // (Phase 1 §11) — distinct from `offline`.
      setState("backend-unreachable");
    } finally {
      clearTimeout(timeout);
    }
    return state;
  }

  function handleBrowserOnline() {
    void checkNow();
  }
  function handleBrowserOffline() {
    setState("offline");
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    checkNow,
    start() {
      if (intervalHandle) return; // idempotent — safe for multiple subscribers to call start()
      if (typeof window !== "undefined") {
        window.addEventListener("online", handleBrowserOnline);
        window.addEventListener("offline", handleBrowserOffline);
      }
      void checkNow();
      intervalHandle = setInterval(() => void checkNow(), intervalMs);
    },
    stop() {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleBrowserOnline);
        window.removeEventListener("offline", handleBrowserOffline);
      }
      if (intervalHandle) clearInterval(intervalHandle);
      intervalHandle = undefined;
    },
  };
}
