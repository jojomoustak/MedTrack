"use client";

import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/sound/client/play-sound";

const UNDO_WINDOW_MS = 5000;

/**
 * A permanent, single-tap "Διαγραφή" next to other same-size row actions
 * is a real mis-tap risk with no recovery (accessibility audit finding,
 * Phase 15 Hardening) — `PurchaseListItemRepository.remove()` is a true
 * tombstone, not the reversible `markRemoved` toggle this same screen
 * already offers as a softer alternative. Rather than a `DeleteMedication
 * Section`-style two-tap expand (awkward inside a dense list row), this
 * mirrors `DoseCard`'s own established optimistic-undo-window pattern:
 * one tap swaps the row into an "Αναίρεση" state and the real delete
 * only fires after `UNDO_WINDOW_MS` unless cancelled first.
 */
export function UndoableDeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function startDelete() {
    playSound("button");
    setPending(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setPending(false);
      onConfirm();
    }, UNDO_WINDOW_MS);
  }

  function cancel() {
    playSound("button");
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPending(false);
  }

  if (pending) {
    return (
      <button
        type="button"
        onClick={cancel}
        aria-live="polite"
        className="inline-flex items-center justify-center min-h-12 min-w-12 rounded-full border border-stone-300 px-3 text-sm font-medium underline dark:border-stone-700"
      >
        Αναίρεση
      </button>
    );
  }

  return (
    <button type="button" onClick={startDelete} aria-label={label} className="inline-flex items-center justify-center min-h-12 min-w-12 text-sm font-medium text-red-700 dark:text-red-400">
      Διαγραφή
    </button>
  );
}
