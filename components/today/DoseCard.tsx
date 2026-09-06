"use client";

import { useEffect, useRef, useState } from "react";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { FORM_LABELS } from "@/components/medications/DetailsStep";
import { playSound } from "@/lib/sound/client/play-sound";
import type { DoseEventRecord, DoseEventStatus } from "@/lib/domain/dose-event";
import type { MedicationForm } from "@/lib/domain/user-medication";

const UNDO_WINDOW_MS = 5000;

export interface DoseCardProps {
  dose: DoseEventRecord;
  medicationName: string;
  /** Read-only everywhere except today's own cards (ux-accessibility-designer design, 2026-08-30): a past/future-day card, or a `missed`/other-terminal one, never renders the Taken/Skip/Snooze trio. */
  actionable: boolean;
  onTaken: (doseId: string) => void;
  onSkipped: (doseId: string) => void;
  onSnoozed: (doseId: string) => void;
  onRetrySync?: (doseId: string) => void;
  /**
   * The one recovery path out of `missed` ("I forgot to log it, but I did
   * take it" -> `taken_late`, `isDoseEventTransitionAllowed`). Deliberately
   * independent of `actionable` — a missed dose surfaced in Today's
   * "Χρειάζεται προσοχή" section is otherwise fully read-only, but still
   * needs this one specific action; only rendered at all when the caller
   * passes this prop, so Calendar's day view (which never passes it)
   * keeps its existing fully-read-only behavior unchanged.
   */
  onTakenLate?: (doseId: string) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}

function unitLabel(unit: string | null): string {
  if (!unit) return "";
  return FORM_LABELS[unit as MedicationForm] ?? unit;
}

function statusLabel(status: DoseEventStatus, dose: DoseEventRecord): string | null {
  switch (status) {
    case "taken":
      return `Ελήφθη ${formatTime(dose.takenAt)}`;
    case "taken_late":
      return `Ελήφθη αργότερα, ${formatTime(dose.takenAt)}`;
    case "skipped":
      return "Παραλείφθηκε";
    case "missed":
      return "Χάθηκε";
    case "cancelled":
      return "Ακυρώθηκε";
    case "snoozed":
      return `Αναβλήθηκε — επόμενη υπενθύμιση στις ${formatTime(dose.reminderAt)}`;
    default:
      return null;
  }
}

function buildAriaLabel(name: string, qtyValue: string | null, qtyUnit: string, timeLabel: string, status: string | null, availableActions: string | null): string {
  const quantityPart = qtyValue ? `${qtyValue} ${qtyUnit}, ` : "";
  const statusPart = status ?? "προγραμματισμένο";
  const base = `${name}, ${quantityPart}${timeLabel}, ${statusPart}`;
  return availableActions ? `${base} — διαθέσιμες ενέργειες: ${availableActions}` : base;
}

/**
 * Phase 3 §2.2's dose card — reused by both Today and Calendar's day view.
 * Actions live inline on the card (Taken/Skip/Snooze), not a separate
 * bottom sheet (ux-accessibility-designer design, 2026-08-30 — matches
 * the Elena-persona driver in Phase 3's own doc, and this codebase has no
 * existing sheet/modal primitive to build on).
 *
 * Taken/Skip both go through a 5s optimistic-undo window before the real
 * `onTaken`/`onSkipped` callback (and thus `DoseEventRepository.
 * transition`) ever fires — the only real protection against a mis-tap,
 * since `transition()` can't un-terminal a row once committed. Snooze is
 * non-terminal (freely repeatable) and fires immediately.
 */
export function DoseCard({ dose, medicationName, actionable, onTaken, onSkipped, onSnoozed, onRetrySync, onTakenLate }: DoseCardProps) {
  const [pendingAction, setPendingAction] = useState<"taken" | "skipped" | "taken_late" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function startUndoWindow(action: "taken" | "skipped" | "taken_late") {
    playSound("button");
    setPendingAction(action);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setPendingAction(null);
      if (action === "taken") onTaken(dose.id);
      else if (action === "skipped") onSkipped(dose.id);
      else onTakenLate?.(dose.id);
    }, UNDO_WINDOW_MS);
  }

  function cancelUndo() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPendingAction(null);
  }

  const timeLabel = formatTime(dose.scheduledAt);
  const displayStatus = pendingAction ? (pendingAction === "skipped" ? "skipped" : "taken_late" === pendingAction ? "taken_late" : "taken") : dose.status;
  const label = pendingAction
    ? pendingAction === "skipped"
      ? "Παραλείφθηκε"
      : `Ελήφθη${pendingAction === "taken_late" ? " αργότερα" : ""} ${formatTime(new Date().toISOString())}`
    : statusLabel(dose.status, dose);
  const showActions = actionable && !pendingAction && (dose.status === "scheduled" || dose.status === "reminded" || dose.status === "snoozed");
  const showMissedRecovery = !pendingAction && dose.status === "missed" && onTakenLate !== undefined;
  const availableActions = showActions ? "Έλαβα, Παράλειψη, Αναβολή" : showMissedRecovery ? "Καταγραφή ως ελήφθη αργότερα" : null;

  return (
    <div
      role="group"
      aria-label={buildAriaLabel(medicationName, dose.quantityValue, unitLabel(dose.quantityUnit), timeLabel, label, availableActions)}
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800"
      data-dose-status={displayStatus}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {timeLabel} — {medicationName}
          </p>
          {dose.quantityValue && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {dose.quantityValue} {unitLabel(dose.quantityUnit)}
            </p>
          )}
          {label && <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>}
        </div>
        {dose.syncState !== "synced" && <SyncStatusChip state={dose.syncState} onRetry={onRetrySync ? () => onRetrySync(dose.id) : undefined} />}
      </div>

      {pendingAction && (
        <button
          type="button"
          onClick={cancelUndo}
          className="min-h-12 self-start rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium underline dark:border-zinc-700"
        >
          Αναίρεση
        </button>
      )}

      {showActions && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => startUndoWindow("taken")}
            className="min-h-14 flex-1 rounded-full bg-zinc-900 px-3 py-3 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Έλαβα
          </button>
          <button
            type="button"
            onClick={() => startUndoWindow("skipped")}
            className="min-h-14 flex-1 rounded-full border border-zinc-300 px-3 py-3 text-sm font-medium dark:border-zinc-700"
          >
            Παράλειψη
          </button>
          <button
            type="button"
            onClick={() => {
              playSound("button");
              onSnoozed(dose.id);
            }}
            className="min-h-14 flex-1 rounded-full border border-zinc-300 px-3 py-3 text-sm font-medium dark:border-zinc-700"
          >
            Αναβολή
          </button>
        </div>
      )}

      {showMissedRecovery && (
        <button
          type="button"
          onClick={() => startUndoWindow("taken_late")}
          className="min-h-14 self-start rounded-full border border-zinc-300 px-4 py-3 text-sm font-medium dark:border-zinc-700"
        >
          Το πήρα, καταγραφή ως αργοπορημένη λήψη
        </button>
      )}
    </div>
  );
}
