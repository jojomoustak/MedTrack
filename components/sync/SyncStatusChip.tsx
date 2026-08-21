"use client";

import { SYNC_STATE_CHIP_CONFIG } from "@/components/sync/sync-state-config";
import { SyncStateIcon } from "@/components/sync/SyncStateIcon";
import { useReducedMotion } from "@/lib/sync/client/use-reduced-motion";
import type { SyncState } from "@/lib/domain/sync";

export interface SyncStatusChipProps {
  state: SyncState;
  /** Required when the state is retryable (`conflict`/`failed`) — omitting it on those states is a defect, not a valid "no-op" chip. */
  onRetry?: () => void;
  className?: string;
}

/**
 * The one sync-status-chip component (Phase 3 §5) — used per-item
 * everywhere an entity's sync state matters. `synced` renders nothing
 * (Phase 3 §5: "Absent (no chip) once an item is synced... to avoid
 * visual noise"); every other state always shows BOTH an icon and a
 * label (never color-only, Phase 3 §5/§9).
 */
export function SyncStatusChip({ state, onRetry, className }: SyncStatusChipProps) {
  const reducedMotion = useReducedMotion();
  const config = SYNC_STATE_CHIP_CONFIG[state];

  // `synced` (and any future state without a config entry) → no persistent chip.
  if (!config) return null;

  const interactive = config.retryable && Boolean(onRetry);
  const classes = ["inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", stateColorClasses(state), interactive ? "cursor-pointer" : "", className]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <SyncStateIcon shape={config.icon} reducedMotion={reducedMotion} />
      {config.label ? <span aria-hidden="true">{config.label}</span> : null}
    </>
  );

  if (interactive) {
    return (
      <button type="button" onClick={onRetry} className={classes} aria-label={config.srLabel} data-sync-state={state}>
        {content}
      </button>
    );
  }

  return (
    <span className={classes} role="status" aria-label={config.srLabel} data-sync-state={state}>
      {content}
    </span>
  );
}

function stateColorClasses(state: SyncState): string {
  switch (state) {
    case "conflict":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
    case "failed":
      return "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200";
    case "syncing":
      return "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200";
    case "deleted":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300";
  }
}
