"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { doseQuantityLabel } from "@/lib/medications/dose-quantity-label";
import { isDoseActionable } from "@/lib/doses/client/dose-actions";
import { playSound } from "@/lib/sound/client/play-sound";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import { DOSE_TILE_CLASSES, DoseStatusMark, doseStatusText, doseVisual, formatDoseTime, type DoseVisual } from "@/components/doses/DoseStatus";
import { ChevronIcon } from "@/components/ui/ChevronIcon";

export const UNDO_WINDOW_MS = 5000;

export interface TodayDoseRowProps {
  dose: DoseEventRecord;
  medicationName: string;
  /** e.g. "500 mg" — shown after the name, like the reference's "Metformin 500 mg". */
  medicationStrength?: string | null;
  /** Records the dose as taken (or taken late, for a missed dose). Called once the undo window closes — or right away if the row unmounts first, so leaving the screen never silently drops the tap. */
  onTake: (doseId: string, kind: "taken" | "taken_late") => void;
  /** Whether a missed dose may be recorded as "taken late" from this row (Today's "needs attention" list). */
  allowTakenLate?: boolean;
  /** Display only (Calendar): no tap-to-take — a dose on another day must not be recorded from a browsing view. */
  readOnly?: boolean;
}

/**
 * Today's compact dose row (reference mockup, screen 1 — user's choice,
 * 2026-10-04: "Like the reference"). The leading tile is the status: tap an
 * open circle to record the dose as taken. Skip / Snooze / Mark missed live
 * on Dose Detail (tap the rest of the row), keeping each row one clear
 * action instead of three competing buttons.
 *
 * A tap starts a 5 s undo window before anything is written — a recorded
 * dose can't be un-taken (`isDoseEventTransitionAllowed`), so the window is
 * the real protection against a mis-tap. If the row unmounts inside the
 * window (the user navigates away), the action is committed rather than
 * dropped: the user meant it and never pressed Undo.
 */
export function TodayDoseRow({ dose, medicationName, medicationStrength, onTake, allowTakenLate = false, readOnly = false }: TodayDoseRowProps) {
  const [pending, setPending] = useState<"taken" | "taken_late" | null>(null);
  const [pendingAt, setPendingAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef<() => void>(() => {});

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        commitRef.current();
      }
    };
  }, []);

  const canTake = isDoseActionable(dose);
  const canTakeLate = allowTakenLate && dose.status === "missed";
  const tappable = !readOnly && !pending && (canTake || canTakeLate);

  function start() {
    const kind = canTake ? "taken" : "taken_late";
    playSound("button");
    setPending(kind);
    setPendingAt(new Date().toISOString());
    commitRef.current = () => onTake(dose.id, kind);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setPending(null);
      commitRef.current();
    }, UNDO_WINDOW_MS);
  }

  function undo() {
    playSound("button");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    commitRef.current = () => {};
    setPending(null);
  }

  const visual: DoseVisual = pending ? "done" : doseVisual(dose.status);
  const time = formatDoseTime(dose.scheduledAt);
  const quantity = doseQuantityLabel(dose.quantityValue, dose.quantityUnit);
  const detail = [quantity, time].filter(Boolean).join(" • ");
  const status = pending ? `Ελήφθη${pending === "taken_late" ? " αργότερα" : ""} ${formatDoseTime(pendingAt)}` : doseStatusText(dose);
  const title = medicationStrength ? `${medicationName} ${medicationStrength}` : medicationName;
  const muted = visual === "skipped" || visual === "cancelled";

  const tileClass = `flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${DOSE_TILE_CLASSES[visual]}`;

  return (
    <div
      className="surface-card flex items-center gap-3.5 py-3 pr-2 pl-3"
      data-dose-status={pending ?? dose.status}
    >
      {tappable ? (
        <button
          type="button"
          onClick={start}
          aria-label={canTake ? `Σήμανση ως ελήφθη: ${title}, ${time}` : `Το πήρα αργότερα: ${title}, ${time}`}
          className={`${tileClass} transition-transform duration-150 active:scale-95`}
        >
          <DoseStatusMark visual={visual} />
        </button>
      ) : (
        <div className={tileClass} aria-hidden="true">
          <DoseStatusMark visual={visual} />
        </div>
      )}

      <Link
        href={`/calendar/dose/${dose.id}`}
        onClick={() => playSound("button")}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-2"
        aria-label={[title, detail, status ?? "προγραμματισμένη"].join(", ")}
      >
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[17px] font-bold ${muted ? "text-stone-500 dark:text-stone-400" : "text-stone-900 dark:text-stone-50"}`}>{title}</p>
          <p className="truncate text-[15px] text-stone-600 tabular-nums dark:text-stone-400">{detail}</p>
          {status && (
            <p aria-live="polite" className={`truncate text-sm font-medium ${visual === "done" ? "text-accent-700 dark:text-accent-400" : visual === "missed" || visual === "snoozed" ? "text-amber-700 dark:text-amber-400" : "text-stone-500 dark:text-stone-400"}`}>
              {status}
            </p>
          )}
        </div>
        {!pending && dose.syncState !== "synced" && <SyncStatusChip state={dose.syncState} compact />}
        {!pending && <ChevronIcon />}
      </Link>

      {pending && (
        <button
          type="button"
          onClick={undo}
          className="min-h-11 shrink-0 rounded-full px-3 text-[15px] font-semibold text-accent-700 underline-offset-2 active:bg-accent-50 dark:text-accent-400 dark:active:bg-accent-950"
        >
          Αναίρεση
        </button>
      )}
    </div>
  );
}
