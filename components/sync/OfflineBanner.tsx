"use client";

import { useNetworkStatus } from "@/lib/sync/client/use-network-status";
import type { NetworkState } from "@/lib/sync/client/network";

export interface OfflineBannerProps {
  /** Overrides the live network status — for tests/storybook-style usage; real callers should omit this and let the component read `useNetworkStatus()` itself. */
  state?: NetworkState;
  onRetry?: () => void;
  className?: string;
}

const COPY: Partial<Record<NetworkState, { message: string; tone: "offline" | "backend" }>> = {
  offline: {
    message: "Είστε εκτός σύνδεσης. Οι αλλαγές σας αποθηκεύονται στη συσκευή και θα συγχρονιστούν αυτόματα.",
    tone: "offline",
  },
  "backend-unreachable": {
    message: "Δυσκολευόμαστε να συνδεθούμε με τους διακομιστές του MedTracking. Τα δεδομένα σας είναι ασφαλή σε αυτή τη συσκευή και θα συγχρονιστούν αυτόματα.",
    tone: "backend",
  },
};

/**
 * Persistent, calm, non-blocking, app-wide banner (Phase 3 §4/§10, §8).
 * Deliberately distinguishes "you're offline" from "we're online but the
 * backend is unreachable" — two different failure modes (Phase 1 §11)
 * with two different messages, never conflated into one generic "error"
 * banner. Renders nothing when `online` — clears itself automatically on
 * reconnect, per Phase 3 §8 ("banner clears automatically on reconnect").
 */
export function OfflineBanner({ state, onRetry, className }: OfflineBannerProps) {
  const liveState = useNetworkStatus();
  const effectiveState = state ?? liveState;
  const copy = COPY[effectiveState];

  if (!copy) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-network-state={effectiveState}
      className={["flex items-center justify-between gap-3 px-4 py-2 text-sm", copy.tone === "backend" ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span>{copy.message}</span>
      {copy.tone === "backend" && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-full border border-current px-3 py-1 text-xs font-medium"
        >
          Δοκιμάστε ξανά
        </button>
      ) : null}
    </div>
  );
}
