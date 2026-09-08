/**
 * `DoseEvent` (Phase 2 §2.7, Phase 10). Conflict strategy: idempotent
 * write by stable ID (`designing-offline-sync`: "rely on stable IDs +
 * idempotent writes rather than 'who won' — two devices marking the same
 * dose taken should converge, not conflict") — never optimistic
 * concurrency, and the server never returns `"conflict"` for this entity
 * (`lib/sync/server/mutations.ts`'s `applyDoseEventTransitionMutation`).
 */
import type { SyncableRecord } from "@/lib/domain/entities";

export const DOSE_EVENT_STATUSES = ["scheduled", "reminded", "taken", "taken_late", "snoozed", "skipped", "missed", "cancelled"] as const;
export type DoseEventStatus = (typeof DOSE_EVENT_STATUSES)[number];

/** Terminal states never transition further — a losing/late write to a terminal row is a silent no-op that returns the current authoritative row (`chk_dose_event_status` doesn't enforce this; the sync handler and both repositories do). */
export const TERMINAL_DOSE_EVENT_STATUSES: readonly DoseEventStatus[] = ["taken", "taken_late", "skipped", "missed", "cancelled"];

export function isTerminalDoseEventStatus(status: DoseEventStatus): boolean {
  return TERMINAL_DOSE_EVENT_STATUSES.includes(status);
}

/**
 * Whether a transition from `from` to `to` is ever allowed. A plain
 * `isTerminalDoseEventStatus(from)` check alone would make `taken_late`
 * unreachable from any real dose-event lifecycle: it's a valid status
 * (schema, validation, and the sync mutation handler all already accept
 * it), fully modeled since Phase 10, but nothing ever produced it — a
 * dose auto-swept to `missed` (`lib/scheduling/client/dose-event-
 * generator.ts`'s `sweepMissedDoseEvents`) had no path back to
 * `taken_late`, the one recovery this status exists for ("I forgot to
 * log it, but I did take it"). `missed -> taken_late` is the single,
 * narrow exception to "terminal states never transition further" — every
 * OTHER terminal status (`taken`/`taken_late`/`skipped`/`cancelled`)
 * still accepts nothing, and `missed` still accepts nothing else. Shared
 * by `DexieDoseEventRepository.transition` and the server's
 * `applyDoseEventMutation` so client and server can never disagree about
 * which transitions are real.
 */
export function isDoseEventTransitionAllowed(from: DoseEventStatus, to: DoseEventStatus): boolean {
  if (!isTerminalDoseEventStatus(from)) return true;
  return from === "missed" && to === "taken_late";
}

export const DOSE_EVENT_SOURCES = ["schedule_generated", "manual_prn", "manual_backfill"] as const;
export type DoseEventSource = (typeof DOSE_EVENT_SOURCES)[number];

export interface DoseEventRecord extends SyncableRecord {
  id: string;
  profileId: string;
  userMedicationId: string;
  /** `null` for ad-hoc PRN (Phase 2 §2.7). */
  scheduleId: string | null;
  /** `null` for a PRN dose logged with no pre-scheduled instant. */
  scheduledAt: string | null;
  reminderAt: string | null;
  takenAt: string | null;
  status: DoseEventStatus;
  quantityValue: string | null;
  quantityUnit: string | null;
  source: DoseEventSource;
  snoozeCount: number;
  /** Free-text, user-entered only — never clinical guidance (CLAUDE.md rule 1). `null` when never set (ADR-014: additive, no capture UI yet). Shown read-only on "Dose history detail" (Phase 3 §2.6). */
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  clientMutationId: string;
}

export type CreateDoseEventInput = Omit<DoseEventRecord, "createdAt" | "updatedAt" | "status" | "takenAt" | "snoozeCount" | "syncState">;

/** A status transition (Taken/Skip/Snooze/etc. — Phase 3 §2.2's dose action sheet). */
export interface DoseEventTransitionPatch {
  status: Exclude<DoseEventStatus, "scheduled">;
  /** Required when `status` is `"taken"` or `"taken_late"` (`chk_taken_has_timestamp`). */
  takenAt?: string;
  quantityValue?: string;
  quantityUnit?: string;
  reminderAt?: string;
}
