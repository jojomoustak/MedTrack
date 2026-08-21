/**
 * Single source of truth for the sync-status-chip spec (Phase 3 §5) —
 * icon shape + label text + accessible full-sentence label + whether the
 * chip persists until user action, for every non-steady `SyncState`.
 * `synced` intentionally has no entry: Phase 3 §5 — "Absent (no chip)
 * once an item is synced... to avoid visual noise on the steady-state
 * case." `SyncStatusChip` renders nothing for that state.
 */
import type { SyncState } from "@/lib/domain/sync";

export type ChipIconShape = "device" | "clock-upload" | "sync-arrows" | "check" | "warning-triangle" | "warning-circle" | "trash";

export interface SyncStateChipConfig {
  icon: ChipIconShape;
  /** Short Greek label shown next to the icon — illustrative copy per Phase 3 §5, not yet final-reviewed localization (Phase 3 "Decisions requiring research"). */
  label: string | null;
  /** Full-sentence screen-reader label (Phase 3 §9: "never just a glyph"). */
  srLabel: string;
  /** Whether this state persists until the user acts, vs. clearing on its own once the underlying condition resolves. */
  persistsUntilAction: boolean;
  /** Whether tapping the chip offers a retry action (Phase 3 §5/§8). */
  retryable: boolean;
}

export const SYNC_STATE_CHIP_CONFIG: Partial<Record<SyncState, SyncStateChipConfig>> = {
  "local-only": {
    icon: "device",
    label: "Αποθηκεύτηκε στη συσκευή",
    srLabel: "Αποθηκευμένο μόνο σε αυτή τη συσκευή, δεν έχει συγχρονιστεί ακόμα.",
    persistsUntilAction: false,
    retryable: false,
  },
  pending: {
    icon: "clock-upload",
    label: "Σε αναμονή συγχρονισμού",
    srLabel: "Σε αναμονή συγχρονισμού.",
    persistsUntilAction: false,
    retryable: false,
  },
  syncing: {
    icon: "sync-arrows",
    label: "Συγχρονίζεται…",
    srLabel: "Συγχρονίζεται τώρα.",
    persistsUntilAction: false,
    retryable: false,
  },
  conflict: {
    icon: "warning-triangle",
    label: "Χρειάζεται έλεγχος — πατήστε",
    srLabel: "Χρειάζεται έλεγχος: υπάρχει διένεξη συγχρονισμού. Πατήστε για λεπτομέρειες.",
    persistsUntilAction: true,
    retryable: true,
  },
  failed: {
    icon: "warning-circle",
    label: "Απέτυχε — πατήστε για επανάληψη",
    srLabel: "Ο συγχρονισμός απέτυχε. Πατήστε για επανάληψη.",
    persistsUntilAction: true,
    retryable: true,
  },
  deleted: {
    icon: "trash",
    label: "Διαγράφεται…",
    srLabel: "Διαγράφεται, σε αναμονή επιβεβαίωσης από τον διακομιστή.",
    persistsUntilAction: false,
    retryable: false,
  },
};
