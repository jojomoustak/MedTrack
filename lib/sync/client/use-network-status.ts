"use client";

import { useEffect, useState } from "react";
import { createNetworkMonitor, type NetworkMonitor, type NetworkState } from "@/lib/sync/client/network";

let sharedMonitor: NetworkMonitor | undefined;

function getSharedMonitor(): NetworkMonitor {
  sharedMonitor ??= createNetworkMonitor();
  return sharedMonitor;
}

/** Test-only: swap in an injected monitor (or clear it) instead of the real browser-backed singleton. */
export function __setNetworkMonitorForTests(monitor: NetworkMonitor | undefined): void {
  sharedMonitor = monitor;
}

/**
 * Reactive network state for any component (Phase 3 §8: distinguishes
 * "you're offline" from "backend unreachable" — see `lib/sync/client/network.ts`).
 * Safe to use from multiple components at once — the underlying monitor
 * is a shared singleton and `start()` is idempotent.
 */
export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>(() => getSharedMonitor().getState());

  useEffect(() => {
    const monitor = getSharedMonitor();
    // Subscribe before starting, so a state change triggered synchronously
    // by start()'s initial checkNow() (or by attaching the online/offline
    // listeners) is never missed between the two calls.
    const unsubscribe = monitor.subscribe(setState);
    monitor.start();
    return unsubscribe;
  }, []);

  return state;
}
