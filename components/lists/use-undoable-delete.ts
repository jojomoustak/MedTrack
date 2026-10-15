"use client";

import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/sound/client/play-sound";

export const UNDO_WINDOW_MS = 5000;

/**
 * A delete with a few seconds to undo it. `PurchaseListItemRepository.
 * remove()` is a real tombstone, so the delete only happens once the window
 * closes without "Αναίρεση" (accessibility audit, Phase 15).
 *
 * If whatever shows the undo goes away inside the window (the row's menu
 * closed, the screen left), the delete still happens: the person asked for
 * it and never pressed undo. It used to be dropped silently, so an item
 * could survive any number of delete attempts (owner-reported, Flagyl on a
 * shopping list, 2026-10-15). Same rule as Today's tap-to-take
 * (`TodayDoseRow`).
 */
export function useUndoableDelete(onConfirm: () => void | Promise<unknown>) {
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmRef = useRef(onConfirm);

  useEffect(() => {
    confirmRef.current = onConfirm;
  }, [onConfirm]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        void confirmRef.current();
      }
    };
  }, []);

  function start() {
    if (timerRef.current) return;
    playSound("button");
    setPending(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      // Back to normal only if the delete didn't take: a deleted item's row is gone by then.
      void Promise.resolve(confirmRef.current()).finally(() => setPending(false));
    }, UNDO_WINDOW_MS);
  }

  function undo() {
    playSound("button");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPending(false);
  }

  return { pending, start, undo };
}
