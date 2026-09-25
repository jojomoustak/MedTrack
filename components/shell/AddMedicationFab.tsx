"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { playSound } from "@/lib/sound/client/play-sound";

const VISIBLE_ON = ["/today", "/medications", "/lists"];

/**
 * Phase 3 §1: FAB "Add Medication" floats above the tab bar, visible on
 * Today, Medications & Lists. UX feedback (2026-09-24): Lists briefly had
 * its own bespoke FAB that focused the create-list form instead — reverted
 * in favor of this same one everywhere, so the floating "+" always means
 * the same thing across the whole app.
 */
export function AddMedicationFab() {
  const pathname = usePathname();
  if (!VISIBLE_ON.some((path) => pathname === path)) return null;

  return (
    <Link
      href="/medications/add"
      onClick={() => playSound("button")}
      aria-label="Προσθήκη φαρμάκου"
      className="fixed right-4 bottom-20 flex min-h-14 min-w-14 items-center justify-center gap-1.5 rounded-full bg-accent-700 px-5 py-4 font-medium text-white shadow-lg transition-transform duration-150 active:scale-95 dark:bg-accent-500 dark:text-stone-950"
    >
      <PlusIcon />
      Φάρμακο
    </Link>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
