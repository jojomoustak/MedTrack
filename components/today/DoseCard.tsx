"use client";

import { useEffect, useRef, useState } from "react";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { MedicationThumbnail } from "@/components/medications/MedicationThumbnail";
import { FORM_LABELS } from "@/components/medications/DetailsStep";
import { playSound } from "@/lib/sound/client/play-sound";
import type { DoseEventRecord, DoseEventStatus } from "@/lib/domain/dose-event";
import type { MedicationForm } from "@/lib/domain/user-medication";

const UNDO_WINDOW_MS = 5000;

export interface DoseCardProps {
  dose: DoseEventRecord;
  medicationName: string;
  /** e.g. "500 mg" — the medication's own strength, not this dose's quantity (`dose.quantityValue`, e.g. "1 tablet"); shown on the card in place of the dose-quantity line (UX feedback, 2026-09-26). `null`/undefined when unresolved yet or unknown, in which case the card shows nothing for this line rather than a placeholder. */
  medicationStrength?: string | null;
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

function buildAriaLabel(
  name: string,
  strength: string | null | undefined,
  qtyValue: string | null,
  qtyUnit: string,
  timeLabel: string,
  status: string | null,
  availableActions: string | null,
): string {
  // Accessibility must not lose information the visual card no longer
  // shows (UX feedback, 2026-09-26, hid the dose-quantity line) — the
  // spoken label still carries strength AND dose quantity, even though
  // only strength is shown on screen now.
  const strengthPart = strength ? `${strength}, ` : "";
  const quantityPart = qtyValue ? `${qtyValue} ${qtyUnit}, ` : "";
  const statusPart = status ?? "προγραμματισμένο";
  const base = `${name}, ${strengthPart}${quantityPart}${timeLabel}, ${statusPart}`;
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
export function DoseCard({ dose, medicationName, medicationStrength, actionable, onTaken, onSkipped, onSnoozed, onRetrySync, onTakenLate }: DoseCardProps) {
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
    playSound("button");
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
  // Design pass (2026-09-26): a resolved dose (taken/taken_late) reads as
  // "done" at a glance — muted + the name struck through — rather than
  // looking identical to an active card except for one line of status text.
  const isCompleted = displayStatus === "taken" || displayStatus === "taken_late";

  return (
    <div
      role="group"
      aria-label={buildAriaLabel(medicationName, medicationStrength, dose.quantityValue, unitLabel(dose.quantityUnit), timeLabel, label, availableActions)}
      className={`flex flex-col gap-2 rounded-[22px] px-4 py-3 dark:border dark:border-stone-800 ${
        isCompleted ? "shadow-sm shadow-stone-300/30 opacity-75" : "shadow-lg shadow-stone-300/40"
      }`}
      data-dose-status={displayStatus}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          {/* UX feedback (2026-09-26): the photo/camera slot leads the
              card — a visual anchor for "which medication is this" — with
              the name and time sharing one line next to it, matching the
              approved design mockup exactly (previously the time sat in
              its own leading column ahead of the photo, which is not what
              was approved). */}
          <MedicationThumbnail userMedicationId={dose.userMedicationId} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className={`truncate text-[17px] font-bold ${isCompleted ? "line-through decoration-stone-400 dark:decoration-stone-600" : ""}`}>{medicationName}</p>
              {/* tabular-nums keeps digit widths steady down a whole list
                  of cards (impeccable craft: numerals in tabular data are
                  a browser default until themed on purpose). */}
              {timeLabel && (
                <span className="shrink-0 text-[15px] font-extrabold tabular-nums text-accent-700 dark:text-accent-400">{timeLabel}</span>
              )}
            </div>
            {/* UX feedback (2026-09-26): shows the medication's strength
                (e.g. "500 mg") instead of the per-dose quantity/form text
                (e.g. "1 Δισκίο") this used to show — kept out of the
                screen reader label change below, not dropped entirely. */}
            {medicationStrength && <p className="text-sm text-stone-600 dark:text-stone-400">{medicationStrength}</p>}
            {/* `aria-live` scoped to just this line, not the whole card, so a
                status change (e.g. tapping Έλαβα) is announced to a screen
                reader without re-announcing the medication name/quantity
                alongside it every time (accessibility audit, Phase 15
                Hardening). */}
            {label && (
              <p aria-live="polite" className="text-sm text-stone-600 dark:text-stone-400">
                {label}
              </p>
            )}
          </div>
        </div>
        {dose.syncState !== "synced" && <SyncStatusChip state={dose.syncState} onRetry={onRetrySync ? () => onRetrySync(dose.id) : undefined} />}
      </div>

      {pendingAction && (
        <button
          type="button"
          onClick={cancelUndo}
          aria-live="polite"
          className="inline-flex items-center justify-center min-h-12 self-start rounded-full border border-stone-300 px-4 py-2 text-sm font-medium underline transition-transform duration-150 active:scale-95 dark:border-stone-700"
        >
          Αναίρεση — {label}
        </button>
      )}

      {showActions && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => startUndoWindow("taken")}
            className="min-h-14 flex-1 rounded-full bg-accent-700 px-3 py-3 text-sm font-medium text-white transition-transform duration-150 active:scale-95 dark:bg-accent-500 dark:text-stone-950"
          >
            Έλαβα
          </button>
          <button
            type="button"
            onClick={() => startUndoWindow("skipped")}
            className="min-h-14 flex-1 rounded-full border border-stone-300 px-3 py-3 text-sm font-medium transition-transform duration-150 active:scale-95 dark:border-stone-700"
          >
            Παράλειψη
          </button>
          <button
            type="button"
            onClick={() => {
              playSound("button");
              onSnoozed(dose.id);
            }}
            className="min-h-14 flex-1 rounded-full border border-stone-300 px-3 py-3 text-sm font-medium transition-transform duration-150 active:scale-95 dark:border-stone-700"
          >
            Αναβολή
          </button>
        </div>
      )}

      {showMissedRecovery && (
        <button
          type="button"
          onClick={() => startUndoWindow("taken_late")}
          className="inline-flex items-center justify-center min-h-14 self-start rounded-full border border-stone-300 px-4 py-3 text-sm font-medium transition-transform duration-150 active:scale-95 dark:border-stone-700"
        >
          Το πήρα, καταγραφή ως αργοπορημένη λήψη
        </button>
      )}
    </div>
  );
}
