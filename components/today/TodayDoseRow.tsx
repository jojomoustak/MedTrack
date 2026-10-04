"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { doseQuantityLabel } from "@/lib/medications/dose-quantity-label";
import { isDoseActionable } from "@/lib/doses/client/dose-actions";
import { playSound } from "@/lib/sound/client/play-sound";
import type { DoseEventRecord } from "@/lib/domain/dose-event";

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
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

type Visual = "open" | "snoozed" | "done" | "skipped" | "missed" | "cancelled";

function visualFor(status: DoseEventRecord["status"]): Visual {
  switch (status) {
    case "taken":
    case "taken_late":
      return "done";
    case "snoozed":
      return "snoozed";
    case "skipped":
      return "skipped";
    case "missed":
      return "missed";
    case "cancelled":
      return "cancelled";
    default:
      return "open";
  }
}

function statusText(dose: DoseEventRecord): string | null {
  switch (dose.status) {
    case "taken":
      return `Ελήφθη ${formatTime(dose.takenAt)}`;
    case "taken_late":
      return `Ελήφθη αργότερα, ${formatTime(dose.takenAt)}`;
    case "snoozed":
      return `Αναβολή έως ${formatTime(dose.reminderAt)}`;
    case "skipped":
      return "Παραλείφθηκε";
    case "missed":
      return "Χάθηκε";
    case "cancelled":
      return "Ακυρώθηκε";
    default:
      return null;
  }
}

const TILE: Record<Visual, string> = {
  open: "bg-stone-100 dark:bg-stone-800",
  snoozed: "bg-amber-50 dark:bg-amber-950/60",
  done: "bg-accent-50 dark:bg-accent-950",
  skipped: "bg-stone-100 dark:bg-stone-800",
  missed: "bg-amber-50 dark:bg-amber-950/60",
  cancelled: "bg-stone-100 dark:bg-stone-800",
};

/** The status circle inside the tile — shape AND color carry the state, never color alone. */
function StatusGlyph({ visual }: { visual: Visual }) {
  const common = { viewBox: "0 0 32 32", width: 30, height: 30, "aria-hidden": true, focusable: false } as const;
  if (visual === "done") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="14" className="fill-accent-700 dark:fill-accent-500" />
        <path d="m10 16.5 4 4 8-9" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (visual === "missed") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="13" fill="none" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth="2.4" />
        <path d="M16 9.5v8" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="16" cy="22" r="1.6" className="fill-amber-600 dark:fill-amber-400" />
      </svg>
    );
  }
  if (visual === "skipped" || visual === "cancelled") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="13" fill="none" className="stroke-stone-400 dark:stroke-stone-500" strokeWidth="2.4" />
        <path d="M10.5 16h11" className="stroke-stone-400 dark:stroke-stone-500" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (visual === "snoozed") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="13" fill="none" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth="2.4" />
        <path d="M16 10v6.5l4 2.5" fill="none" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="16" cy="16" r="13" fill="none" className="stroke-accent-800 dark:stroke-accent-400" strokeWidth="2.4" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-stone-500">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
export function TodayDoseRow({ dose, medicationName, medicationStrength, onTake, allowTakenLate = false }: TodayDoseRowProps) {
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
  const tappable = !pending && (canTake || canTakeLate);

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

  const visual: Visual = pending ? "done" : visualFor(dose.status);
  const time = formatTime(dose.scheduledAt);
  const quantity = doseQuantityLabel(dose.quantityValue, dose.quantityUnit);
  const detail = [quantity, time].filter(Boolean).join(" • ");
  const status = pending ? `Ελήφθη${pending === "taken_late" ? " αργότερα" : ""} ${formatTime(pendingAt)}` : statusText(dose);
  const title = medicationStrength ? `${medicationName} ${medicationStrength}` : medicationName;
  const muted = visual === "skipped" || visual === "cancelled";

  const tileClass = `flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TILE[visual]}`;

  return (
    <div
      className="flex items-center gap-3.5 rounded-2xl bg-white py-3 pr-2 pl-3 shadow-[0_1px_2px_rgba(28,25,23,.04),0_2px_8px_rgba(28,25,23,.06)] dark:border dark:border-stone-800 dark:bg-stone-900 dark:shadow-none"
      data-dose-status={pending ?? dose.status}
    >
      {tappable ? (
        <button
          type="button"
          onClick={start}
          aria-label={canTake ? `Σήμανση ως ελήφθη: ${title}, ${time}` : `Το πήρα αργότερα: ${title}, ${time}`}
          className={`${tileClass} transition-transform duration-150 active:scale-95`}
        >
          <StatusGlyph visual={visual} />
        </button>
      ) : (
        <div className={tileClass} aria-hidden="true">
          <StatusGlyph visual={visual} />
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
        {!pending && dose.syncState !== "synced" && <SyncStatusChip state={dose.syncState} />}
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
